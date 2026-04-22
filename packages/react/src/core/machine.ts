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
import type { BlueprintSurveyChoice, EmbedCoupon, EmbedResponse } from './api-types'
import type { SessionCredentials } from './token'
import { buildOfferDecision, defaultOfferCopy, transformEmbedResponse } from './transform'
import type {
  AcceptedOffer,
  BuiltInOfferConfig,
  BuiltInStepType,
  DirectCustomer,
  DirectSubscription,
  FlowConfig,
  FlowState,
  OfferConfig,
  OfferDecision,
  ReasonConfig,
  ResolvedFlowConfig,
  Step,
  SurveyStep,
} from './types'

function offerConfigToDecision(offer: OfferConfig): OfferDecision {
  return {
    ...offer,
    copy: defaultOfferCopy(offer),
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

// --- Wire translation ---
//
// The SDK speaks lowercase/idiomatic ('survey', 'discount', 'month'); the
// server enforces uppercase enums. Everything bound for the wire funnels
// through the helpers below so drift is a compile error, not a Mongoose
// rejection at runtime.

// Record-typed so TypeScript enforces exhaustiveness. Adding a new built-in
// step or offer type to the source unions in types.ts fails compilation
// here until its wire mapping is added.
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

// 'success' is the SDK's post-outcome view; the `outcome` field on the session
// already captures it, so tracking it as a separate stepsViewed entry would
// double-count. Everything else lands on the wire — custom step names ride
// along in customStepType so funnels can break them out.
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
// The server stores two shapes for the same logical thing: presentedOffers
// mirrors the blueprint's nested configs (discountConfig, pauseConfig, …),
// while acceptedOffer flattens the fields. Each builder takes the SDK's
// OfferDecision and projects it into the correct wire shape.

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

export class CancelFlowMachine {
  private state: FlowState
  private cachedSnapshot: FlowState
  private config: ResolvedFlowConfig
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
    if (config.session && config.steps) {
      this.localSteps = config.steps
    }
    this.config = this.resolveConfig(config)
    if (config.mode) this.configMode = config.mode
    if (config.appId && config.customer) {
      this.analyticsClient = new AnalyticsClient(config.appId, config.apiBaseUrl)
      this.directCustomer = config.customer
      this.directSubscriptions = config.subscriptions ?? null
    }
    const firstStep = this.config.steps[0]?.type ?? 'survey'
    this.state = {
      step: firstStep,
      selectedReason: null,
      recommendation: null,
      alternatives: [],
      feedback: '',
      outcome: null,
      isProcessing: false,
      error: null,
      customer: null,
    }
    this.cachedSnapshot = { ...this.state }

    // In token mode we defer tracking until initializeFromEmbed — we don't
    // have blueprint step guids yet, so any entry written now would be stale.
    if (!config.session) {
      this.trackStepView(firstStep)
    }
  }

  // All public methods are arrow-bound so consumers can pass them directly
  // (e.g. `<button onClick={flow.next}>`) and so useSyncExternalStore gets
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
    return this.config.reasons
  }

  get stepIndex(): number {
    return this.getVisibleSteps().indexOf(this.state.step)
  }

  get totalSteps(): number {
    return this.getVisibleSteps().length
  }

  selectReason = (id: string): void => {
    const reason = this.config.reasons.find((r) => r.id === id)
    if (!reason) return

    let recommendation: OfferDecision | null = null

    if (reason.offer) {
      if (this.isTokenMode() && this.embedData) {
        const apiChoice = this.findApiChoice(id)
        if (apiChoice?.offer) {
          recommendation = buildOfferDecision(apiChoice.offer, this.embedData.coupons, this.embedData.offerPlans)
        }
      }
      if (!recommendation) {
        recommendation = offerConfigToDecision(reason.offer)
      }
    }

    this.setState({
      selectedReason: id,
      recommendation,
      alternatives: [],
    })
  }

  next = (result?: Record<string, unknown>): void => {
    // Drop non-plain-object results — a React SyntheticEvent from `onClick={next}`
    // isn't meaningful payload and has circular refs.
    if (isPlainObject(result)) {
      this.customStepResults[this.state.step] = result
    }

    const visible = this.getVisibleSteps()
    const currentIdx = visible.indexOf(this.state.step)
    if (currentIdx < 0 || currentIdx >= visible.length - 1) return

    if (this.state.step === 'survey' && this.state.recommendation) {
      this.setState({ step: 'offer' })
      return
    }

    this.setState({ step: visible[currentIdx + 1] })
  }

  back = (): void => {
    const visible = this.getVisibleSteps()
    const currentIdx = visible.indexOf(this.state.step)
    if (currentIdx <= 0) return
    this.setState({ step: visible[currentIdx - 1] })
  }

  accept = async (result?: Record<string, unknown>): Promise<void> => {
    if (!this.state.recommendation) return
    // Drop non-plain-object results — a React SyntheticEvent from `onClick={accept}`
    // isn't meaningful payload and has circular refs.
    const safeResult = isPlainObject(result) ? result : undefined
    this.setState({ isProcessing: true, error: null })
    try {
      const acceptedOffer = this.buildAcceptedOffer(safeResult)

      if (this.isTokenMode()) {
        await this.executeTokenAction(acceptedOffer)
      }

      await this.config.onAccept?.(acceptedOffer)
      this.markCurrentOfferAccepted()
      this.setState({ step: 'success', outcome: 'saved', isProcessing: false })
      this.recordOutcome('saved', safeResult)
    } catch (error) {
      this.setState({ isProcessing: false, error: error as Error })
    }
  }

  decline = (): void => {
    this.markCurrentOfferDeclined()
    if (this.state.alternatives.length > 0) {
      const [next, ...rest] = this.state.alternatives
      this.setState({ recommendation: next, alternatives: rest })
      this.recordOfferPresented()
      return
    }
    const visible = this.getVisibleSteps()
    const offerIdx = visible.indexOf('offer')
    if (offerIdx >= 0 && offerIdx < visible.length - 1) {
      this.setState({ step: visible[offerIdx + 1] })
    }
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

      await this.config.onCancel?.()
      this.setState({ step: 'success', outcome: 'cancelled', isProcessing: false })
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
    this.config.onClose?.()
  }

  getStepConfig(stepType: string): Step | undefined {
    return this.config.steps.find((s) => s.type === stepType)
  }

  destroy(): void {
    this.listeners.clear()
  }

  initializeFromEmbed(
    embedData: EmbedResponse,
    apiClient: ChurnkeyApi,
    creds: SessionCredentials,
    callbacks: {
      onAccept?: (offer: AcceptedOffer) => Promise<void>
      onCancel?: () => Promise<void>
      onClose?: () => void
      onStepChange?: (step: string, prevStep: string) => void
    },
  ): void {
    this.apiClient = apiClient
    this.creds = creds
    this.embedData = embedData

    const result = transformEmbedResponse(embedData, creds, callbacks)
    this.blueprintId = result.blueprintId
    this.config = result.config

    if (this.localSteps) {
      this.config = this.mergeLocalSteps(this.config, this.localSteps)
    }

    const firstStep = this.config.steps[0]?.type ?? 'survey'
    this.state = {
      ...this.state,
      step: firstStep,
      selectedReason: null,
      recommendation: null,
      alternatives: [],
      feedback: '',
      outcome: null,
      isProcessing: false,
      error: null,
      customer: embedData.customer ?? null,
    }
    this.cachedSnapshot = { ...this.state }
    this.trackStepView(firstStep)
    this.notify()
  }

  private isTokenMode(): boolean {
    return this.apiClient != null
  }

  private setState(partial: Partial<FlowState>): void {
    const prevStep = this.state.step
    this.state = { ...this.state, ...partial }
    this.cachedSnapshot = { ...this.state }
    if (partial.step && partial.step !== prevStep) {
      this.finalizeStepView(prevStep)
      this.trackStepView(partial.step)
      if (partial.step === 'offer') {
        this.recordOfferPresented()
      }
      this.config.onStepChange?.(partial.step, prevStep)
    }
    this.notify()
  }

  private recordOfferPresented(): void {
    const rec = this.state.recommendation
    if (!rec) return
    this.presentedOffers.push({
      ...toPresentedOfferConfig(rec),
      guid: rec.decisionId,
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

  private resolveConfig(config: FlowConfig): ResolvedFlowConfig {
    if (config.session) {
      return {
        reasons: [],
        steps: [],
        onAccept: config.onAccept,
        onCancel: config.onCancel,
        onClose: config.onClose,
        onStepChange: config.onStepChange,
      }
    }

    const surveyStep = config.steps?.find((s): s is SurveyStep => s.type === 'survey')

    return {
      reasons: surveyStep?.reasons ?? [],
      steps: config.steps ?? [],
      onAccept: config.onAccept,
      onCancel: config.onCancel,
      onClose: config.onClose,
      onStepChange: config.onStepChange,
    }
  }

  private mergeLocalSteps(serverConfig: ResolvedFlowConfig, localSteps: Step[]): ResolvedFlowConfig {
    const localByType = new Map(localSteps.map((s) => [s.type, s]))

    const merged = serverConfig.steps.map((serverStep) => {
      const local = localByType.get(serverStep.type)
      if (!local) return serverStep
      localByType.delete(serverStep.type)
      return { ...serverStep, ...local }
    })

    for (const [, step] of localByType) {
      merged.push(step)
    }

    const surveyStep = merged.find((s): s is SurveyStep => s.type === 'survey')

    return {
      ...serverConfig,
      steps: merged,
      reasons: surveyStep?.reasons ?? serverConfig.reasons,
    }
  }

  private findApiChoice(reasonId: string): BlueprintSurveyChoice | undefined {
    if (!this.embedData) return undefined
    for (const step of this.embedData.blueprint.steps) {
      if (step.stepType === 'SURVEY' && step.survey?.choices) {
        for (const choice of step.survey.choices) {
          const choiceId = choice.guid ?? choice.id
          if (choiceId === reasonId) return choice
        }
      }
    }
    return undefined
  }

  private async executeTokenAction(offer: AcceptedOffer): Promise<void> {
    if (!this.apiClient) return

    // Custom offer types fall through — handled by onAccept
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
        await this.apiClient.extendTrial(o.days)
        break
    }
  }

  private trackStepView(step: string): void {
    this.stepEnteredAt = Date.now()
    const mapped = toApiStepType(step)
    if (!mapped) return

    const entry: StepViewed = {
      ...mapped,
      start: new Date().toISOString(),
    }

    // Blueprint guid lookup only applies to built-in steps — custom steps
    // don't exist in the server blueprint so there's nothing to join against.
    if (mapped.stepType !== 'CUSTOM') {
      const blueprintStep = this.embedData?.blueprint.steps.find((s) => s.stepType === mapped.stepType)
      if (blueprintStep?.guid) entry.guid = blueprintStep.guid
    }

    if (step === 'survey') {
      const surveyStep = this.config.steps.find((s) => s.type === 'survey') as SurveyStep | undefined
      if (surveyStep) entry.numChoices = surveyStep.reasons.length
    }

    this.stepsViewed.push(entry)
  }

  private finalizeStepView(step: string): void {
    const mapped = toApiStepType(step)
    if (!mapped) return
    // Match the most recent entry for this step. Custom steps disambiguate on
    // customStepType since multiple custom types share stepType === 'CUSTOM'.
    const entry = [...this.stepsViewed]
      .reverse()
      .find((s) => s.stepType === mapped.stepType && s.customStepType === mapped.customStepType)
    if (entry) {
      entry.end = new Date().toISOString()
      entry.duration = Date.now() - this.stepEnteredAt
    }
  }

  private getVisibleSteps(): string[] {
    const steps = this.config.steps.map((s) => s.type)

    // Offer step is implicit: reasons can carry offers without the consumer
    // declaring an 'offer' step. Insert it after survey when a reason was picked.
    if (this.state.recommendation && !steps.includes('offer')) {
      const surveyIdx = steps.indexOf('survey')
      if (surveyIdx >= 0) {
        steps.splice(surveyIdx + 1, 0, 'offer')
      } else {
        steps.unshift('offer')
      }
    }

    return steps
  }

  private buildAcceptedOffer(result?: Record<string, unknown>): AcceptedOffer {
    const { copy: _, ...offerConfig } = this.state.recommendation!
    return {
      ...offerConfig,
      reasonId: this.state.selectedReason!,
      ...(result ? { result } : {}),
    }
  }

  private resolveSessionCustomer(): SessionPayload['customer'] {
    if (this.creds) {
      return {
        id: this.creds.customerId,
        subscriptionId: this.creds.subscriptionId,
        ...(this.directCustomer
          ? directDataToSessionCustomer(this.directCustomer, this.directSubscriptions ?? undefined)
          : {}),
      }
    }
    if (this.directCustomer) {
      return directDataToSessionCustomer(this.directCustomer, this.directSubscriptions ?? undefined)
    }
    return undefined
  }

  private buildBasePayload(): SessionPayload {
    const selectedReason = this.config.reasons.find((r) => r.id === this.state.selectedReason)
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
      // Signed token's mode wins over FlowConfig.mode — the client can't
      // override what the server signed. `configMode` already defaults to 'live'.
      mode: (this.creds?.mode ?? this.configMode) === 'test' ? 'TEST' : 'LIVE',
      provider: this.isTokenMode() ? undefined : 'sdk-react',
      embedVersion: 'sdk-react',
    }

    // Token-mode parity with churnkey-embed so session analytics, funnels,
    // and FTC compliance reporting line up across both integration paths.
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

  private recordOutcome(outcome: 'saved' | 'cancelled', result?: Record<string, unknown>): void {
    const client = this.apiClient ?? this.analyticsClient
    if (!client) return
    this.finalizeStepView(this.state.step)

    const payload = this.buildBasePayload()
    payload.canceled = outcome === 'cancelled'

    if (outcome === 'saved' && this.state.recommendation) {
      payload.acceptedOffer = toAcceptedOfferPayload(this.state.recommendation, this.embedData?.coupons, result)
    }

    client.createSession(payload).catch(() => {})
  }
}
