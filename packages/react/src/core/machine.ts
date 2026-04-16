import type { ChurnkeyApi, SessionPayload } from './api'
import { AnalyticsClient, directDataToSessionCustomer } from './api'
import type { BlueprintSurveyChoice, EmbedResponse } from './api-types'
import type { SessionCredentials } from './token'
import { buildOfferDecision, defaultOfferCopy, transformEmbedResponse } from './transform'
import type {
  AcceptedOffer,
  BuiltInOfferConfig,
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
  private stepsViewed: Array<{ stepType: string; start: string; end?: string; duration?: number }> = []
  private presentedOffers: Array<{ guid?: string }> = []
  private stepEnteredAt: number = Date.now()

  constructor(config: FlowConfig) {
    this.config = this.resolveConfig(config)
    if (config.appId && config.customer) {
      this.analyticsClient = new AnalyticsClient(config.appId)
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
    this.trackStepView(firstStep)
  }

  // Stable refs for useSyncExternalStore

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

  next = (): void => {
    const visible = this.getVisibleSteps()
    const currentIdx = visible.indexOf(this.state.step)
    if (currentIdx < 0 || currentIdx >= visible.length - 1) return

    // From survey: skip to offer if there's an offer, otherwise next in array
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

  accept = async (): Promise<void> => {
    if (!this.state.recommendation) return
    this.setState({ isProcessing: true, error: null })
    try {
      const acceptedOffer = this.buildAcceptedOffer()

      if (this.isTokenMode()) {
        await this.executeTokenAction(acceptedOffer)
      }

      await this.config.onAccept?.(acceptedOffer)
      this.setState({ step: 'success', outcome: 'saved', isProcessing: false })
      this.recordOutcome('saved')
    } catch (error) {
      this.setState({ isProcessing: false, error: error as Error })
    }
  }

  decline = (): void => {
    if (this.state.alternatives.length > 0) {
      const [next, ...rest] = this.state.alternatives
      this.setState({ recommendation: next, alternatives: rest })
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

    const firstStep = this.config.steps[0]?.type ?? 'survey'
    this.setState({
      step: firstStep,
      selectedReason: null,
      recommendation: null,
      alternatives: [],
      feedback: '',
      outcome: null,
      isProcessing: false,
      error: null,
      customer: embedData.customer ?? null,
    })
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
      if (partial.step === 'offer' && this.state.recommendation?.decisionId) {
        this.presentedOffers.push({ guid: this.state.recommendation.decisionId })
      }
      this.config.onStepChange?.(partial.step, prevStep)
    }
    this.notify()
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
    this.stepsViewed.push({
      stepType: step.toUpperCase(),
      start: new Date().toISOString(),
    })
  }

  private finalizeStepView(step: string): void {
    const entry = [...this.stepsViewed].reverse().find((s) => s.stepType === step.toUpperCase())
    if (entry) {
      entry.end = new Date().toISOString()
      entry.duration = Date.now() - this.stepEnteredAt
    }
  }

  private getVisibleSteps(): string[] {
    const steps: string[] = []

    for (const step of this.config.steps) {
      steps.push(step.type)
    }

    // If there's an active recommendation and no explicit offer step,
    // insert the implicit offer step after survey
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

  private buildAcceptedOffer(): AcceptedOffer {
    const { copy: _, ...offerConfig } = this.state.recommendation!
    return {
      ...offerConfig,
      reasonId: this.state.selectedReason!,
    }
  }

  private recordOutcome(outcome: 'saved' | 'cancelled'): void {
    const client = this.apiClient ?? this.analyticsClient
    if (!client) return

    this.finalizeStepView(this.state.step)

    const selectedReason = this.config.reasons.find((r) => r.id === this.state.selectedReason)
    const rec = this.state.recommendation

    const customer = this.creds
      ? {
          id: this.creds.customerId,
          subscriptionId: this.creds.subscriptionId,
          ...(this.directCustomer
            ? directDataToSessionCustomer(this.directCustomer, this.directSubscriptions ?? undefined)
            : {}),
        }
      : this.directCustomer
        ? directDataToSessionCustomer(this.directCustomer, this.directSubscriptions ?? undefined)
        : undefined

    const payload: SessionPayload = {
      blueprintId: this.blueprintId ?? undefined,
      customer,
      canceled: outcome === 'cancelled',
      surveyChoiceId: this.state.selectedReason ?? undefined,
      surveyChoiceValue: selectedReason?.label,
      feedback: this.state.feedback || undefined,
      presentedOffers: this.presentedOffers,
      stepsViewed: this.stepsViewed,
      mode: this.creds?.mode === 'test' ? 'TEST' : 'LIVE',
      provider: this.isTokenMode() ? undefined : 'sdk-react',
      embedVersion: 'sdk-react',
    }

    if (outcome === 'saved' && rec) {
      const o = rec as BuiltInOfferConfig & { decisionId?: string }
      payload.acceptedOffer = {
        guid: rec.decisionId,
        offerType: rec.type.toUpperCase(),
        ...(o.type === 'discount' && {
          couponId: o.couponId,
          couponAmount: o.percent,
          couponType: 'PERCENT',
        }),
        ...(o.type === 'pause' && {
          pauseDuration: o.months,
          pauseInterval: o.interval ?? 'month',
        }),
        ...(o.type === 'plan_change' && {
          newPlanId: o.plans?.[0]?.id,
          newPlanPrice: o.plans?.[0]?.price,
        }),
        ...(o.type === 'trial_extension' && {
          trialExtensionDays: o.days,
        }),
        ...(o.type === 'redirect' && {
          redirectUrl: o.url,
        }),
      }
    }

    client.createSession(payload).catch(() => {})
  }
}
