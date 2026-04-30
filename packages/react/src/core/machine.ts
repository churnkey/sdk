import type {
  AcceptedOfferPayload,
  ApiOfferType,
  ApiPauseInterval,
  ApiStepType,
  ChurnkeyApi,
  PresentedOffer,
  SessionPayload,
  StepViewed,
} from './api'
import { AnalyticsClient, directDataToSessionCustomer } from './api'
import type { SdkConfig } from './api-types'
import { applyMergeFieldsToSteps } from './merge-fields'
import { buildStepGraph, type ResolvedStep, type StepGraph } from './step-graph'
import type { SessionCredentials } from './token'
import { defaultOfferCopy, transformSdkConfig } from './transform'
import type {
  AcceptedOffer,
  BuiltInOfferConfig,
  BuiltInStepType,
  DirectCustomer,
  DirectSubscription,
  FlowCallbacks,
  FlowConfig,
  FlowState,
  OfferDecision,
  ReasonConfig,
  Step,
} from './types'

type OfferCallback = (offer: AcceptedOffer, customer: DirectCustomer | null) => Promise<void> | void

function handlerFor(offerType: string, cb: FlowCallbacks): OfferCallback | undefined {
  switch (offerType) {
    case 'discount':
      return cb.handleDiscount
    case 'pause':
      return cb.handlePause
    case 'plan_change':
      return cb.handlePlanChange
    case 'trial_extension':
      return cb.handleTrialExtension
    default:
      return undefined
  }
}

function listenerFor(offerType: string, cb: FlowCallbacks): OfferCallback | undefined {
  switch (offerType) {
    case 'discount':
      return cb.onDiscount
    case 'pause':
      return cb.onPause
    case 'plan_change':
      return cb.onPlanChange
    case 'trial_extension':
      return cb.onTrialExtension
    default:
      return undefined
  }
}

// Listener errors are swallowed — they're side effects, not part of the
// success path, and shouldn't flip the flow into an error state.
function runListener(listener: OfferCallback, offer: AcceptedOffer, customer: DirectCustomer | null): Promise<void> {
  return Promise.resolve(listener(offer, customer)).catch((e) => {
    console.error('Error in offer listener:', e)
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

// --- Wire translation ---
//
// SDK types use lowercase identifiers; the API expects uppercase enums.
// Both maps are typed as exhaustive Records so adding a new built-in step
// or offer type fails the build until its wire mapping is set.
const STEP_TYPE_API_MAP: Record<Exclude<BuiltInStepType, 'success'>, Exclude<ApiStepType, 'CUSTOM'>> = {
  survey: 'SURVEY',
  offer: 'OFFER',
  feedback: 'FREEFORM',
  confirm: 'CONFIRM',
}

const OFFER_TYPE_API_MAP: Record<BuiltInOfferConfig['type'], Exclude<ApiOfferType, 'CUSTOM'>> = {
  discount: 'DISCOUNT',
  pause: 'PAUSE',
  plan_change: 'PLAN_CHANGE',
  trial_extension: 'TRIAL_EXTENSION',
  contact: 'CONTACT',
  redirect: 'REDIRECT',
}

// 'success' isn't a stepsViewed entry — the session's outcome/canceled/
// acceptedOffer already captures the terminal state, and recording it
// separately would double-count the funnel's last hop.
function toApiStepType(step: string): { stepType: ApiStepType; customStepType?: string } | null {
  if (step === 'success') return null
  const builtIn = STEP_TYPE_API_MAP[step as Exclude<BuiltInStepType, 'success'>]
  if (builtIn) return { stepType: builtIn }
  return { stepType: 'CUSTOM', customStepType: step }
}

function toApiOfferType(type: string): { offerType: ApiOfferType; customOfferType?: string } {
  const builtIn = OFFER_TYPE_API_MAP[type as BuiltInOfferConfig['type']]
  if (builtIn) return { offerType: builtIn }
  return { offerType: 'CUSTOM', customOfferType: type }
}

function toApiPauseInterval(interval: 'month' | 'week' | undefined): ApiPauseInterval {
  return interval === 'week' ? 'WEEK' : 'MONTH'
}

// --- Offer shape builders ---
//
// Sessions record offers two ways: presentedOffers keeps the nested config
// shape (discountConfig, pauseConfig, …); acceptedOffer flattens the fields.
// Two builders, one source of truth.

function toPresentedOfferConfig(rec: OfferDecision): Partial<PresentedOffer> {
  const base = toApiOfferType(rec.type)
  if (base.offerType === 'CUSTOM') return base
  const o = rec as BuiltInOfferConfig
  switch (o.type) {
    case 'discount':
      return {
        ...base,
        discountConfig: { couponId: o.couponId, customAmount: o.percentOff },
      }
    case 'pause':
      return {
        ...base,
        pauseConfig: {
          maxPauseLength: o.months,
          pauseInterval: toApiPauseInterval(o.interval),
        },
      }
    case 'plan_change':
      return { ...base, planChangeConfig: {} }
    case 'trial_extension':
      return { ...base, trialExtensionConfig: { trialExtensionDays: o.days } }
    case 'redirect':
      return {
        ...base,
        redirectConfig: { redirectUrl: o.url, redirectLabel: o.label },
      }
    case 'contact':
      return { ...base, contactConfig: {} }
    default:
      return base
  }
}

function toAcceptedOfferPayload(rec: OfferDecision, result?: Record<string, unknown>): AcceptedOfferPayload {
  const base: AcceptedOfferPayload = { guid: rec.decisionId, ...toApiOfferType(rec.type) }
  if (base.offerType === 'CUSTOM') {
    return result ? { ...base, customOfferResult: result } : base
  }
  const o = rec as BuiltInOfferConfig
  switch (o.type) {
    case 'discount':
      return {
        ...base,
        couponId: o.couponId,
        couponAmount: o.percentOff,
        couponType: 'PERCENT',
        couponDuration: o.durationInMonths,
      }
    case 'pause':
      return {
        ...base,
        pauseDuration: o.months,
        pauseInterval: toApiPauseInterval(o.interval),
      }
    case 'plan_change':
      return {
        ...base,
        newPlanId: o.plans?.[0]?.id,
        newPlanPrice: o.plans?.[0]?.amount.value,
      }
    case 'trial_extension':
      return { ...base, trialExtensionDays: o.days }
    case 'redirect':
      return { ...base, redirectUrl: o.url }
    default:
      return base
  }
}

// --- Machine ---

export class CancelFlowMachine {
  private state: FlowState
  private cachedSnapshot: FlowState
  private callbacks: FlowCallbacks
  private graph: StepGraph = { stepMap: {}, firstStepId: '', orderedStepIds: [] }
  private listeners: Set<() => void> = new Set()

  private apiClient: ChurnkeyApi | null = null
  private analyticsClient: AnalyticsClient | null = null
  private directCustomer: DirectCustomer | null = null
  private directSubscriptions: DirectSubscription[] | null = null
  private creds: SessionCredentials | null = null
  private config: SdkConfig | null = null
  private blueprintId: string | null = null
  private localSteps: Step[] | null = null
  private stepsViewed: StepViewed[] = []
  private presentedOffers: PresentedOffer[] = []
  private customStepResults: Record<string, unknown> = {}
  private configMode: 'live' | 'test' = 'live'
  private stepEnteredAt: number = Date.now()
  private aborted = false
  // Visited-step stack. `back` pops this so it lands on the actually-seen
  // previous step (including synthetic offers a survey choice spawned),
  // not the previous step in declared graph order.
  private history: string[] = []

  constructor(config: FlowConfig) {
    // FlowConfig extends FlowCallbacks; storing the whole config covers
    // every callback by name without a separate copy.
    this.callbacks = config
    if (config.mode) this.configMode = config.mode
    if (config.appId && config.customer) {
      this.analyticsClient = new AnalyticsClient(config.appId, config.apiBaseUrl)
      this.directCustomer = config.customer
      this.directSubscriptions = config.subscriptions ?? null
    }

    // Token mode defers graph construction until initializeFromConfig runs
    // with the server-supplied steps; stash any locally-declared steps for
    // merging then.
    if (config.session) {
      if (config.steps) this.localSteps = config.steps
    } else if (config.steps) {
      const merged = applyMergeFieldsToSteps(config.steps, this.directCustomer)
      this.graph = buildStepGraph(merged, defaultOfferCopy)
    }

    this.state = this.buildInitialState(null)
    this.cachedSnapshot = { ...this.state }

    // Defer entry tracking in token mode — firing trackStepEnter before the
    // graph is built would record a stale (empty) guid.
    const first = this.firstStep()
    if (!config.session && first) this.trackStepEnter(first)
  }

  // Public methods are arrow-bound so consumers can pass them directly
  // (`<button onClick={flow.next}>`) and so useSyncExternalStore sees
  // stable references between renders.

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): FlowState => {
    return this.cachedSnapshot
  }

  get reasons(): ReasonConfig[] {
    return this.surveyStep()?.reasons ?? []
  }

  get currentStep(): ResolvedStep | undefined {
    return this.graph.stepMap[this.state.currentStepId]
  }

  /** The offer on the current step, or null. Always derived — no separate slot to drift. */
  get currentOffer(): OfferDecision | null {
    return this.currentStep?.offer ?? null
  }

  /** Whether `back()` would move anywhere — false on the first step and on success. */
  get canGoBack(): boolean {
    if (this.state.step === 'success') return false
    return this.history.length > 0 || Boolean(this.currentStep?.defaultPreviousStep)
  }

  /**
   * First step of a given type. Fine for the common "one step per type" case;
   * flows with multiple of a type should key on currentStepId instead.
   */
  getStepConfig(stepType: string): ResolvedStep | undefined {
    return Object.values(this.graph.stepMap).find((s) => s.type === stepType)
  }

  /** Progress indicator index. Synthetic offers share their survey's slot. */
  get stepIndex(): number {
    const current = this.currentStep
    if (!current) return 0
    if (current.surveyOffer) {
      const surveyId = current.defaultPreviousStep
      return surveyId ? this.graph.orderedStepIds.indexOf(surveyId) : 0
    }
    return Math.max(0, this.graph.orderedStepIds.indexOf(current.guid))
  }

  get totalSteps(): number {
    return this.graph.orderedStepIds.length
  }

  selectReason = (id: string): void => {
    if (!this.reasons.find((r) => r.id === id)) return
    this.setState({ selectedReason: id })
  }

  next = (result?: Record<string, unknown>): void => {
    // `onClick={next}` would otherwise pass a SyntheticEvent through as result
    // — has circular refs, breaks JSON.stringify. Only accept plain objects.
    if (isPlainObject(result)) {
      this.customStepResults[this.state.step] = result
    }
    const nextId = this.projectedNextStepId()
    if (!nextId) return
    this.transitionTo(nextId, { recordHistory: true })
  }

  back = (): void => {
    const popped = this.history.pop()
    if (popped) {
      this.transitionTo(popped)
      return
    }
    // History is empty when the consumer triggered back without a prior
    // forward navigation (e.g. starting state). Fall back to declared order.
    const prevId = this.currentStep?.defaultPreviousStep
    if (prevId) this.transitionTo(prevId)
  }

  accept = async (result?: Record<string, unknown>): Promise<void> => {
    // Capture before any state transition — the 'success' transition may
    // move currentStepId off the offer step, depending on whether a success
    // step is declared in the graph.
    const offer = this.currentOffer
    if (!offer) return
    const safeResult = isPlainObject(result) ? result : undefined
    this.setState({ isProcessing: true, error: null })
    try {
      const acceptedOffer = this.buildAcceptedOffer(offer, safeResult)
      const customer = this.state.customer

      // Handler wins over the server-side action. With no handler, token mode
      // hits the server endpoint and local mode is a no-op (relying on
      // onAccept's catch-all if anything).
      const handler = handlerFor(offer.type, this.callbacks)
      if (handler) {
        await handler(acceptedOffer, customer)
      } else if (this.isTokenMode()) {
        await this.executeTokenAction(acceptedOffer)
      }

      // Listeners fire after the action succeeded, regardless of who ran it.
      // Per-type listener first, then the catch-all onAccept.
      const listener = listenerFor(offer.type, this.callbacks)
      if (listener) await runListener(listener, acceptedOffer, customer)
      await this.callbacks.onAccept?.(acceptedOffer, customer)

      this.markCurrentOfferAccepted()
      this.enterSuccessStep('saved')
      this.recordOutcome('saved', offer, safeResult)
    } catch (error) {
      this.setState({ isProcessing: false, error: error as Error })
    }
  }

  decline = (): void => {
    this.markCurrentOfferDeclined()
    const nextId = this.currentStep?.defaultNextStep
    if (nextId) this.transitionTo(nextId, { recordHistory: true })
  }

  setFeedback = (text: string): void => {
    this.setState({ feedback: text })
  }

  cancel = async (): Promise<void> => {
    this.setState({ isProcessing: true, error: null })
    try {
      const customer = this.state.customer

      if (this.callbacks.handleCancel) {
        await this.callbacks.handleCancel(customer)
      } else if (this.isTokenMode()) {
        await this.apiClient!.cancelSubscription()
      }

      await this.callbacks.onCancel?.(customer)
      this.enterSuccessStep('cancelled')
      this.recordOutcome('cancelled')
    } catch (error) {
      this.setState({ isProcessing: false, error: error as Error })
    }
  }

  close = (): void => {
    if (this.state.outcome === null && !this.aborted) {
      this.aborted = true
      this.recordAbort()
    }
    this.callbacks.onClose?.()
  }

  destroy(): void {
    this.listeners.clear()
  }

  // Callbacks are wired through the constructor; this only takes the
  // server-supplied config so callers can't accidentally clobber them.
  initializeFromConfig(config: SdkConfig, apiClient: ChurnkeyApi, creds: SessionCredentials): void {
    this.apiClient = apiClient
    this.creds = creds
    this.config = config

    const result = transformSdkConfig(config)
    this.blueprintId = result.blueprintId

    const merged = this.localSteps ? mergeLocalSteps(result.steps, this.localSteps) : result.steps
    const steps = applyMergeFieldsToSteps(merged, config.customer ?? null)
    this.graph = buildStepGraph(steps, defaultOfferCopy)

    this.state = this.buildInitialState(config.customer ?? null)
    this.cachedSnapshot = { ...this.state }
    const first = this.firstStep()
    if (first) this.trackStepEnter(first)
    this.notify()
  }

  // --- Internal helpers ---

  private isTokenMode(): boolean {
    return this.apiClient != null
  }

  private firstStep(): ResolvedStep | undefined {
    return this.graph.stepMap[this.graph.firstStepId]
  }

  private surveyStep(): ResolvedStep | undefined {
    return this.graph.surveyStepId ? this.graph.stepMap[this.graph.surveyStepId] : undefined
  }

  private buildInitialState(customer: DirectCustomer | null): FlowState {
    const first = this.firstStep()
    return {
      step: first?.type ?? 'survey',
      currentStepId: this.graph.firstStepId,
      selectedReason: null,
      feedback: '',
      outcome: null,
      isProcessing: false,
      error: null,
      customer,
    }
  }

  // On a survey step with a selected reason that has an attached offer,
  // jump to that offer's synthetic step; otherwise follow the default
  // forward pointer.
  private projectedNextStepId(): string | undefined {
    const current = this.currentStep
    if (!current) return undefined
    if (current.offersAttached && this.state.selectedReason) {
      const override = current.offersAttached[this.state.selectedReason]
      if (override) return override
    }
    return current.defaultNextStep
  }

  // Single entry point for step changes. All navigation flows through here so
  // view-timing and presentation tracking stay in one place. Forward callers
  // pass recordHistory; `back` omits it so popping isn't reversed.
  private transitionTo(stepId: string, opts: { recordHistory?: boolean } = {}): void {
    const step = this.graph.stepMap[stepId]
    if (!step) return
    if (opts.recordHistory && this.state.currentStepId && this.state.currentStepId !== stepId) {
      this.history.push(this.state.currentStepId)
    }
    this.setState({ step: step.type, currentStepId: stepId })
  }

  private setState(partial: Partial<FlowState>): void {
    const prevStep = this.state.step
    this.state = { ...this.state, ...partial }
    this.cachedSnapshot = { ...this.state }
    if (partial.step && partial.step !== prevStep) {
      this.finalizeStepView(prevStep)
      // enterSuccessStep can set state.step='success' without moving currentStepId
      // (when no success step is declared). Only feed the new graph node into
      // trackStepEnter when its type actually matches — otherwise the prior
      // step would be re-recorded.
      const step = this.graph.stepMap[this.state.currentStepId]
      if (step?.type === partial.step) this.trackStepEnter(step)
      else this.trackStepView(partial.step)
      this.callbacks.onStepChange?.(partial.step, prevStep)
    }
    this.notify()
  }

  private trackStepEnter(step: ResolvedStep): void {
    this.trackStepView(step.type, step.guid, step.numChoices)
    if (step.type === 'offer') this.recordOfferPresented()
  }

  private recordOfferPresented(): void {
    const offer = this.currentOffer
    if (!offer) return
    this.presentedOffers.push({
      ...toPresentedOfferConfig(offer),
      guid: offer.decisionId,
      accepted: false,
      presentedAt: new Date().toISOString(),
    })
  }

  private markCurrentOfferAccepted(): void {
    const last = this.presentedOffers[this.presentedOffers.length - 1]
    if (!last || last.acceptedAt || last.declinedAt) return
    last.accepted = true
    last.acceptedAt = new Date().toISOString()
  }

  private markCurrentOfferDeclined(): void {
    const last = this.presentedOffers[this.presentedOffers.length - 1]
    if (!last || last.acceptedAt || last.declinedAt) return
    last.declinedAt = new Date().toISOString()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private async executeTokenAction(offer: AcceptedOffer): Promise<void> {
    if (!this.apiClient) return

    // Only built-in offer types have a server action; custom types route
    // entirely through the consumer's handler/onAccept.
    const o = offer as BuiltInOfferConfig
    switch (o.type) {
      case 'discount':
        if (o.couponId) {
          await this.apiClient.applyDiscount(o.couponId, this.blueprintId ?? undefined)
        }
        break
      case 'pause':
        await this.apiClient.pause({ duration: o.months, interval: o.interval ?? 'month' })
        break
      case 'plan_change':
        await this.apiClient.changePlan(o.plans[0]?.id)
        break
      case 'trial_extension':
        await this.apiClient.extendTrial(o.days, this.blueprintId ?? undefined)
        break
    }
  }

  private trackStepView(stepType: string, guid?: string, numChoices?: number): void {
    this.stepEnteredAt = Date.now()
    const mapped = toApiStepType(stepType)
    if (!mapped) return

    const entry: StepViewed = {
      ...mapped,
      start: new Date().toISOString(),
    }
    if (guid) entry.guid = guid
    if (numChoices != null) entry.numChoices = numChoices

    this.stepsViewed.push(entry)
  }

  private finalizeStepView(step: string): void {
    const mapped = toApiStepType(step)
    if (!mapped) return
    // Match the most recent entry for this step. Custom steps share
    // stepType='CUSTOM', so disambiguate on customStepType.
    const entry = [...this.stepsViewed]
      .reverse()
      .find((s) => s.stepType === mapped.stepType && s.customStepType === mapped.customStepType)
    if (entry) {
      entry.end = new Date().toISOString()
      entry.duration = Date.now() - this.stepEnteredAt
    }
  }

  // Offer passed in so accept() can capture it before enterSuccessStep
  // potentially moves currentStepId off the offer step.
  private buildAcceptedOffer(offer: OfferDecision, result?: Record<string, unknown>): AcceptedOffer {
    const { copy: _, ...offerConfig } = offer
    return {
      ...offerConfig,
      reasonId: this.state.selectedReason!,
      ...(result ? { result } : {}),
    }
  }

  // Terminal transition. Prefer moving currentStepId to a declared success
  // step so the developer's savedTitle / classNames / custom component
  // applies; otherwise stay put and the renderer's defaults cover it.
  private enterSuccessStep(outcome: 'saved' | 'cancelled'): void {
    const success = this.getStepConfig('success')
    const partial: Partial<FlowState> = { step: 'success', outcome, isProcessing: false }
    if (success) partial.currentStepId = success.guid
    this.setState(partial)
  }

  private resolveSessionCustomer(): SessionPayload['customer'] {
    const direct = this.directCustomer
      ? directDataToSessionCustomer(this.directCustomer, this.directSubscriptions ?? undefined)
      : undefined
    // Token identifies the customer authoritatively; direct data fills in
    // extras (email, plan, metadata) but never overrides id/subscriptionId.
    if (this.creds) {
      return { ...direct, id: this.creds.customerId, subscriptionId: this.creds.subscriptionId }
    }
    return direct
  }

  private buildBasePayload(): SessionPayload {
    const selectedReason = this.reasons.find((r) => r.id === this.state.selectedReason)
    const payload: SessionPayload = {
      blueprintId: this.blueprintId ?? undefined,
      customer: this.resolveSessionCustomer(),
      canceled: false,
      surveyChoiceId: this.state.selectedReason ?? undefined,
      surveyChoiceValue: selectedReason?.label,
      feedback: this.state.feedback || undefined,
      presentedOffers: this.presentedOffers,
      stepsViewed: this.stepsViewed,
      customStepResults: Object.keys(this.customStepResults).length > 0 ? this.customStepResults : undefined,
      // Token's signed mode wins — the client can't override it.
      mode: (this.creds?.mode ?? this.configMode) === 'test' ? 'TEST' : 'LIVE',
      provider: this.isTokenMode() ? undefined : 'sdk-react',
      embedVersion: 'sdk-react',
    }

    // Token-mode session-record fields. Required by downstream analytics
    // and compliance reporting on the dashboard.
    if (this.config) {
      const surveyStep = this.config.steps.find((s) => s.type === 'survey')
      payload.surveyId = surveyStep?.guid
      payload.clickToCancelEnabled = this.config.settings.clickToCancelEnabled
      payload.strictFTCComplianceEnabled = this.config.settings.strictFTCComplianceEnabled
      payload.usedClickToCancel = false
      payload.autoOptimizationUsed = !!this.config.autoOptimizationKey
      payload.autoOptimizationKey = this.config.autoOptimizationKey
      payload.discountCooldown = this.config.settings.discountCooldown
      payload.pauseCooldown = this.config.settings.pauseCooldown
      payload.discountCooldownApplied = false
      payload.pauseCooldownApplied = false
    }

    return payload
  }

  private recordAbort(): void {
    const client = this.apiClient ?? this.analyticsClient
    if (!client) return
    this.finalizeStepView(this.state.step)
    client.createSession({ ...this.buildBasePayload(), aborted: true }).catch(() => {})
  }

  // acceptedOffer is a parameter so callers capture it before enterSuccessStep
  // moves currentStepId off the offer step. setState already finalized the
  // step view on the way to 'success', so no extra finalize call here.
  private recordOutcome(
    outcome: 'saved' | 'cancelled',
    acceptedOffer?: OfferDecision,
    result?: Record<string, unknown>,
  ): void {
    const client = this.apiClient ?? this.analyticsClient
    if (!client) return

    const payload = this.buildBasePayload()
    payload.canceled = outcome === 'cancelled'

    if (outcome === 'saved' && acceptedOffer) {
      payload.acceptedOffer = toAcceptedOfferPayload(acceptedOffer, result)
    }

    client.createSession(payload).catch(() => {})
  }
}

// Local steps override server steps by type. Unmatched local steps append
// at the end. Server order is preserved so the dashboard stays in charge of
// flow shape while developers can swap in their own copy / custom steps.
function mergeLocalSteps(serverSteps: Step[], localSteps: Step[]): Step[] {
  const localByType = new Map(localSteps.map((s) => [s.type, s]))
  const merged = serverSteps.map((serverStep) => {
    const local = localByType.get(serverStep.type)
    if (!local) return serverStep
    localByType.delete(serverStep.type)
    return { ...serverStep, ...local } as Step
  })
  for (const [, step] of localByType) merged.push(step)
  return merged
}
