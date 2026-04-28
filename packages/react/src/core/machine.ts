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
import type { EmbedCoupon, EmbedCustomer, EmbedResponse } from './api-types'
import { buildStepGraph, type ResolvedStep, type StepGraph } from './step-graph'
import type { SessionCredentials } from './token'
import { defaultOfferCopy, transformEmbedResponse } from './transform'
import type {
  AcceptedOffer,
  BuiltInOfferConfig,
  BuiltInStepType,
  DirectCustomer,
  DirectSubscription,
  FlowConfig,
  FlowState,
  OfferDecision,
  ReasonConfig,
  Step,
} from './types'

interface Callbacks {
  onAccept?: (offer: AcceptedOffer) => Promise<void>
  onCancel?: () => Promise<void>
  onClose?: () => void
  onStepChange?: (step: string, prevStep: string) => void
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

// --- Wire translation ---
//
// SDK types are lowercase/idiomatic; the server enforces uppercase enums.
// Keep everything heading over the wire behind these helpers so new step or
// offer types fail at compile time rather than at Mongoose-validation time.

// Record-typed for exhaustiveness. Adding a new BuiltInStepType fails the
// build here until its wire mapping is added.
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
// The server stores the same offer two ways: presentedOffers keeps the
// blueprint's nested configs (discountConfig, pauseConfig, …); acceptedOffer
// flattens the fields. Two builders, one source of truth.

function toPresentedOfferConfig(rec: OfferDecision): Partial<PresentedOffer> {
  const base = toApiOfferType(rec.type)
  if (base.offerType === 'CUSTOM') return base
  const o = rec as BuiltInOfferConfig
  switch (o.type) {
    case 'discount':
      return {
        ...base,
        discountConfig: { couponId: o.couponId, customAmount: o.percent },
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

function toAcceptedOfferPayload(
  rec: OfferDecision,
  coupons?: EmbedCoupon[],
  result?: Record<string, unknown>,
): AcceptedOfferPayload {
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
        couponAmount: o.percent,
        couponType: 'PERCENT',
        couponDuration: o.months ?? coupons?.find((c) => c.id === o.couponId)?.couponDuration,
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
        newPlanPrice: o.plans?.[0]?.price,
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
  private callbacks: Callbacks
  private graph: StepGraph = { stepMap: {}, firstStepId: '', orderedStepIds: [] }
  private listeners: Set<() => void> = new Set()

  private apiClient: ChurnkeyApi | null = null
  private analyticsClient: AnalyticsClient | null = null
  private directCustomer: DirectCustomer | null = null
  private directSubscriptions: DirectSubscription[] | null = null
  private creds: SessionCredentials | null = null
  private embedData: EmbedResponse | null = null
  private blueprintId: string | null = null
  private localSteps: Step[] | null = null
  private stepsViewed: StepViewed[] = []
  private presentedOffers: PresentedOffer[] = []
  private customStepResults: Record<string, unknown> = {}
  private configMode: 'live' | 'test' = 'live'
  private stepEnteredAt: number = Date.now()
  private aborted = false

  constructor(config: FlowConfig) {
    this.callbacks = {
      onAccept: config.onAccept,
      onCancel: config.onCancel,
      onClose: config.onClose,
      onStepChange: config.onStepChange,
    }
    if (config.mode) this.configMode = config.mode
    if (config.appId && config.customer) {
      this.analyticsClient = new AnalyticsClient(config.appId, config.apiBaseUrl)
      this.directCustomer = config.customer
      this.directSubscriptions = config.subscriptions ?? null
    }

    // Token mode defers graph construction until initializeFromEmbed has
    // the server's blueprint; stash any locally-declared steps so they can
    // be merged later.
    if (config.session) {
      if (config.steps) this.localSteps = config.steps
    } else if (config.steps) {
      this.graph = buildStepGraph(config.steps, defaultOfferCopy)
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
    this.transitionTo(nextId)
  }

  back = (): void => {
    const prevId = this.currentStep?.defaultPreviousStep
    if (!prevId) return
    this.transitionTo(prevId)
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

      if (this.isTokenMode()) {
        await this.executeTokenAction(acceptedOffer)
      }

      await this.callbacks.onAccept?.(acceptedOffer)
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
    if (nextId) this.transitionTo(nextId)
  }

  setFeedback = (text: string): void => {
    this.setState({ feedback: text })
  }

  cancel = async (): Promise<void> => {
    this.setState({ isProcessing: true, error: null })
    try {
      if (this.isTokenMode()) {
        await this.apiClient!.cancelSubscription()
      }

      await this.callbacks.onCancel?.()
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

  // Callbacks are wired via the constructor — caller is responsible for
  // passing them in (or, in the React layer, ref-thunks that dispatch to the
  // consumer's latest closure). Keeping this method to the embed-specific
  // payload means callers can't accidentally clobber callback wiring.
  initializeFromEmbed(embedData: EmbedResponse, apiClient: ChurnkeyApi, creds: SessionCredentials): void {
    this.apiClient = apiClient
    this.creds = creds
    this.embedData = embedData

    const result = transformEmbedResponse(embedData)
    this.blueprintId = result.blueprintId

    const steps = this.localSteps ? mergeLocalSteps(result.steps, this.localSteps) : result.steps
    this.graph = buildStepGraph(steps, defaultOfferCopy)

    this.state = this.buildInitialState(embedData.customer ?? null)
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

  private buildInitialState(customer: EmbedCustomer | null): FlowState {
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

  // Mirrors the embed's projectedNextStep: on a survey step with a selected
  // choice that has an offer, jump to the synthetic offer step; otherwise
  // follow the default pointer.
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
  // view-timing and presentation tracking stay in one place.
  private transitionTo(stepId: string): void {
    const step = this.graph.stepMap[stepId]
    if (!step) return
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

    // Only built-in offer types hit a server action. Custom types have no
    // server-side handler — the developer's onAccept callback owns the work.
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

    // Token-mode parity with the hosted embed. Session analytics, funnels,
    // and FTC compliance reporting assume these fields are populated.
    if (this.embedData) {
      const { blueprint } = this.embedData
      const surveyStep = blueprint.steps.find((s) => s.stepType === 'SURVEY')
      payload.surveyId = surveyStep?.guid
      payload.clickToCancelEnabled = this.embedData.clickToCancelEnabled ?? false
      payload.strictFTCComplianceEnabled = this.embedData.strictFTCComplianceEnabled ?? false
      payload.usedClickToCancel = false
      payload.autoOptimizationUsed = this.embedData.autoOptimizationUsed ?? false
      payload.autoOptimizationKey = this.embedData.autoOptimizationKey
      payload.discountCooldown = blueprint.discountCooldown
      payload.pauseCooldown = blueprint.pauseCooldown
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
      payload.acceptedOffer = toAcceptedOfferPayload(acceptedOffer, this.embedData?.coupons, result)
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
