import type {
  AcceptedOffer,
  FlowConfig,
  FlowState,
  OfferConfig,
  OfferCopy,
  OfferDecision,
  ReasonConfig,
  ResolvedFlowConfig,
  Step,
  StepType,
  SurveyStep,
} from './types'

// ---------------------------------------------------------------------------
// Default copy generators for local mode (no token)
// ---------------------------------------------------------------------------

function defaultOfferCopy(offer: OfferConfig): OfferCopy {
  switch (offer.type) {
    case 'discount':
      return {
        headline: `How about ${offer.percent}% off?`,
        body: `We'd like to offer you ${offer.percent}% off for ${offer.months} month${offer.months === 1 ? '' : 's'}.`,
        cta: 'Accept offer',
        declineCta: 'No thanks',
      }
    case 'pause':
      return {
        headline: 'Take a break instead?',
        body: `Pause your subscription for up to ${offer.months} month${offer.months === 1 ? '' : 's'}.`,
        cta: 'Pause subscription',
        declineCta: 'No thanks',
      }
    case 'plan_change':
      return {
        headline: 'Switch to a different plan?',
        body: 'We have other plans that might be a better fit.',
        cta: 'Switch plan',
        declineCta: 'No thanks',
      }
    case 'trial_extension':
      return {
        headline: 'Need more time?',
        body: `We'll extend your trial by ${offer.days} day${offer.days === 1 ? '' : 's'}.`,
        cta: 'Extend trial',
        declineCta: 'No thanks',
      }
    case 'contact':
      return {
        headline: 'Talk to us first?',
        body: 'Our team would love to help resolve any issues.',
        cta: offer.label ?? 'Contact support',
        declineCta: 'No thanks',
      }
    case 'redirect':
      return {
        headline: 'Before you go...',
        body: 'Check this out — it might change your mind.',
        cta: offer.label,
        declineCta: 'No thanks',
      }
  }
}

function offerConfigToDecision(offer: OfferConfig): OfferDecision {
  return {
    type: offer.type,
    params: { ...offer },
    copy: defaultOfferCopy(offer),
  }
}

// ---------------------------------------------------------------------------
// CancelFlowMachine
// ---------------------------------------------------------------------------

export class CancelFlowMachine {
  private state: FlowState
  private config: ResolvedFlowConfig
  private listeners: Set<() => void> = new Set()

  constructor(config: FlowConfig) {
    this.config = this.resolveConfig(config)
    this.state = {
      step: 'survey',
      selectedReason: null,
      recommendation: null,
      alternatives: [],
      feedback: '',
      outcome: null,
      isProcessing: false,
      error: null,
    }
  }

  // --- Public getters ---

  get snapshot(): FlowState {
    return { ...this.state }
  }

  get reasons(): ReasonConfig[] {
    return this.config.reasons
  }

  get stepIndex(): number {
    const visibleSteps = this.getVisibleSteps()
    return visibleSteps.indexOf(this.state.step)
  }

  get totalSteps(): number {
    return this.getVisibleSteps().length
  }

  // --- Actions ---

  selectReason(id: string): void {
    const reason = this.config.reasons.find(r => r.id === id)
    if (!reason) return

    const recommendation = reason.offer
      ? offerConfigToDecision(reason.offer)
      : null

    this.setState({
      selectedReason: id,
      recommendation,
      alternatives: [],
    })
  }

  next(): void {
    const transitions: Record<string, string | undefined> = {
      survey: this.state.recommendation ? 'offer' : this.getNextAfterOffer(),
      offer: this.getNextAfterOffer(),
      feedback: 'confirm',
      confirm: undefined,
    }
    const nextStep = transitions[this.state.step]
    if (nextStep) this.setState({ step: nextStep as StepType })
  }

  back(): void {
    const transitions: Record<string, string | undefined> = {
      offer: 'survey',
      feedback: this.state.recommendation ? 'offer' : 'survey',
      confirm: this.hasFeedbackStep()
        ? 'feedback'
        : this.state.recommendation
          ? 'offer'
          : 'survey',
    }
    const prevStep = transitions[this.state.step]
    if (prevStep) this.setState({ step: prevStep as StepType })
  }

  async accept(): Promise<void> {
    if (!this.state.recommendation) return
    this.setState({ isProcessing: true, error: null })
    try {
      await this.config.onAccept?.(this.buildAcceptedOffer())
      this.setState({ step: 'success', outcome: 'saved', isProcessing: false })
      this.recordOutcome('saved')
    } catch (error) {
      this.setState({ isProcessing: false, error: error as Error })
    }
  }

  decline(): void {
    if (this.state.alternatives.length > 0) {
      const [next, ...rest] = this.state.alternatives
      this.setState({ recommendation: next, alternatives: rest })
      return
    }
    // Proceed past the offer step
    const nextStep = this.getNextAfterOffer()
    if (nextStep) this.setState({ step: nextStep as StepType })
  }

  setFeedback(text: string): void {
    this.setState({ feedback: text })
  }

  async cancel(): Promise<void> {
    this.setState({ isProcessing: true, error: null })
    try {
      await this.config.onCancel?.()
      this.setState({ step: 'success', outcome: 'cancelled', isProcessing: false })
      this.recordOutcome('cancelled')
    } catch (error) {
      this.setState({ isProcessing: false, error: error as Error })
    }
  }

  close(): void {
    this.config.onClose?.()
  }

  // --- Step config access ---

  getStepConfig(stepType: StepType): Step | undefined {
    return this.config.steps.find(s => s.type === stepType)
  }

  // --- Subscription (for useSyncExternalStore) ---

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  destroy(): void {
    this.listeners.clear()
  }

  // --- Private ---

  private setState(partial: Partial<FlowState>): void {
    const prevStep = this.state.step
    this.state = { ...this.state, ...partial }
    if (partial.step && partial.step !== prevStep) {
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
      return this.resolveFromToken(config.session, config)
    }
    return this.resolveFromSteps(config)
  }

  private resolveFromSteps(config: FlowConfig): ResolvedFlowConfig {
    const surveyStep = config.steps?.find(
      (s): s is SurveyStep => s.type === 'survey'
    )

    return {
      reasons: surveyStep?.reasons ?? [],
      steps: config.steps ?? [],
      onAccept: config.onAccept,
      onCancel: config.onCancel,
      onClose: config.onClose,
      onStepChange: config.onStepChange,
    }
  }

  private resolveFromToken(_token: string, _config: FlowConfig): ResolvedFlowConfig {
    // Phase 4: decode JWT, extract reasons, offers, copy, etc.
    throw new Error('Token mode not yet implemented')
  }

  private hasFeedbackStep(): boolean {
    return this.config.steps.some(s => s.type === 'feedback')
  }

  private hasConfirmStep(): boolean {
    return this.config.steps.some(s => s.type === 'confirm')
  }

  private getNextAfterOffer(): string {
    if (this.hasFeedbackStep()) return 'feedback'
    if (this.hasConfirmStep()) return 'confirm'
    return 'confirm' // always need a terminal step
  }

  private getVisibleSteps(): StepType[] {
    const steps: StepType[] = ['survey']

    // Offer step is visible only if current reason has an offer
    if (this.state.recommendation) {
      steps.push('offer')
    }

    if (this.hasFeedbackStep()) steps.push('feedback')
    if (this.hasConfirmStep()) steps.push('confirm')

    return steps
  }

  private buildAcceptedOffer(): AcceptedOffer {
    const rec = this.state.recommendation!
    const base = {
      reasonId: this.state.selectedReason!,
      decisionId: rec.decisionId,
    }

    // Map OfferDecision back to the typed AcceptedOffer union
    const params = rec.params as Record<string, unknown>

    switch (rec.type) {
      case 'discount':
        return {
          type: 'discount',
          percent: params.percent as number,
          months: params.months as number,
          couponId: params.couponId as string | undefined,
          ...base,
        }
      case 'pause':
        return {
          type: 'pause',
          months: params.months as number,
          interval: (params.interval as 'month' | 'week') ?? 'month',
          ...base,
        }
      case 'plan_change':
        return {
          type: 'plan_change',
          planId: params.planId as string,
          planName: params.planName as string,
          planPrice: params.planPrice as number,
          ...base,
        }
      case 'trial_extension':
        return {
          type: 'trial_extension',
          days: params.days as number,
          ...base,
        }
      case 'contact':
        return {
          type: 'contact',
          url: params.url as string | undefined,
          ...base,
        }
      case 'redirect':
        return {
          type: 'redirect',
          url: params.url as string,
          ...base,
        }
    }
  }

  private recordOutcome(_outcome: 'saved' | 'cancelled'): void {
    // Phase 4: POST outcome to server
  }
}
