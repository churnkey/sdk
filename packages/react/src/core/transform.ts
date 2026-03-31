import type {
  BlueprintOffer,
  BlueprintStep,
  BlueprintSurveyChoice,
  EmbedCoupon,
  EmbedPlan,
  EmbedResponse,
} from './api-types'
import type { SessionCredentials } from './token'
import type {
  AcceptedOffer,
  BuiltInOfferConfig,
  OfferConfig,
  OfferCopy,
  OfferDecision,
  Plan,
  ReasonConfig,
  ResolvedFlowConfig,
  Step,
} from './types'

export interface TransformResult {
  config: ResolvedFlowConfig
  blueprintId: string
  metadata: {
    autoOptimizationKey?: string
    autoOptimizationUsed?: boolean
  }
}

export function transformEmbedResponse(
  response: EmbedResponse,
  creds: SessionCredentials,
  callbacks: {
    onAccept?: (offer: AcceptedOffer) => Promise<void>
    onCancel?: () => Promise<void>
    onClose?: () => void
    onStepChange?: (step: string, prevStep: string) => void
  },
): TransformResult {
  const { blueprint, coupons, offerPlans } = response
  const enabledSteps = blueprint.steps.filter((s) => s.enabled !== false)

  const steps = transformSteps(enabledSteps, coupons, offerPlans)
  const surveyStep = steps.find((s) => s.type === 'survey')
  const reasons = surveyStep && 'reasons' in surveyStep ? surveyStep.reasons : []

  return {
    config: {
      reasons,
      steps,
      onAccept: callbacks.onAccept,
      onCancel: callbacks.onCancel,
      onClose: callbacks.onClose,
      onStepChange: callbacks.onStepChange,
    },
    blueprintId: blueprint._id,
    metadata: {
      autoOptimizationKey: response.autoOptimizationKey,
      autoOptimizationUsed: response.autoOptimizationUsed,
    },
  }
}

function transformSteps(apiSteps: BlueprintStep[], coupons: EmbedCoupon[], plans: EmbedPlan[]): Step[] {
  const steps: Step[] = []

  for (const apiStep of apiSteps) {
    switch (apiStep.stepType) {
      case 'SURVEY':
        steps.push({
          type: 'survey',
          title: apiStep.header,
          description: apiStep.description,
          reasons: transformReasons(apiStep.survey?.choices ?? [], coupons, plans),
        })
        break

      case 'OFFER':
        steps.push({
          type: 'offer',
          title: apiStep.header,
          description: apiStep.description,
        })
        break

      case 'FREEFORM':
        steps.push({
          type: 'feedback',
          title: apiStep.header,
          description: apiStep.description,
          placeholder: apiStep.freeform?.placeholder,
          required: apiStep.freeform?.required,
          minLength: apiStep.freeform?.minLength,
        })
        break

      case 'CONFIRM':
        steps.push({
          type: 'confirm',
          title: apiStep.header,
          description: apiStep.description,
        })
        break
    }
  }

  return steps
}

export function transformReasons(
  choices: BlueprintSurveyChoice[],
  coupons: EmbedCoupon[],
  plans: EmbedPlan[],
): ReasonConfig[] {
  return choices.map((choice, index) => {
    const id = choice.guid ?? choice.id ?? `reason-${index}`
    const reason: ReasonConfig = {
      id,
      label: choice.value,
    }

    if (choice.offer) {
      reason.offer = transformOffer(choice.offer, coupons, plans)
    }

    return reason
  })
}

export function transformOffer(
  apiOffer: BlueprintOffer,
  coupons: EmbedCoupon[],
  plans: EmbedPlan[],
): OfferConfig | undefined {
  switch (apiOffer.offerType) {
    case 'DISCOUNT': {
      const couponId = apiOffer.discountConfig?.couponId
      const coupon = couponId ? coupons.find((c) => c.id === couponId) : undefined
      if (!coupon && !apiOffer.discountConfig?.customAmount) return undefined

      const percent =
        coupon?.couponType === 'PERCENT' ? coupon.couponAmount : (apiOffer.discountConfig?.customAmount ?? 0)
      const months = coupon?.couponDuration ?? apiOffer.discountConfig?.customDuration ?? 1

      return {
        type: 'discount',
        percent,
        months,
        couponId: couponId,
      }
    }

    case 'PAUSE': {
      const option = apiOffer.pauseConfig?.options?.[0]
      const months = option?.duration ?? apiOffer.pauseConfig?.maxPauseLength ?? 1
      const interval = (option?.interval ?? apiOffer.pauseConfig?.pauseInterval ?? 'month') as 'month' | 'week'

      return {
        type: 'pause',
        months,
        interval,
        datePicker: apiOffer.pauseConfig?.datePicker,
      }
    }

    case 'PLAN_CHANGE': {
      const planIds = apiOffer.planChangeConfig?.options ?? []
      const sdkPlans: Plan[] = planIds
        .map((id) => plans.find((p) => p.id === id))
        .filter((p): p is EmbedPlan => p != null)
        .map((p) => ({
          id: p.id,
          name: p.name ?? p.id,
          price: (p.price ?? 0) / 100, // API stores cents
          interval: (p.interval ?? 'month') as 'month' | 'year',
          currency: p.currency ?? 'USD',
          features: p.features,
        }))

      if (sdkPlans.length === 0) return undefined
      return { type: 'plan_change', plans: sdkPlans }
    }

    case 'TRIAL_EXTENSION': {
      const days = apiOffer.trialExtensionConfig?.trialExtensionDays ?? 7
      return { type: 'trial_extension', days }
    }

    case 'REDIRECT': {
      const url = apiOffer.redirectConfig?.redirectUrl
      if (!url) return undefined
      return {
        type: 'redirect',
        url,
        label: apiOffer.redirectConfig?.redirectLabel ?? 'Learn more',
      }
    }

    case 'CONTACT':
      return { type: 'contact' }

    default:
      return undefined
  }
}

export function buildOfferCopy(apiOffer: BlueprintOffer, offerConfig: OfferConfig): OfferCopy {
  return {
    headline: apiOffer.header || defaultOfferCopy(offerConfig).headline,
    body: apiOffer.description || defaultOfferCopy(offerConfig).body,
    cta: apiOffer.ctaText || defaultOfferCopy(offerConfig).cta,
    declineCta: apiOffer.declineText || defaultOfferCopy(offerConfig).declineCta,
  }
}

export function defaultOfferCopy(offer: OfferConfig): OfferCopy {
  const o = offer as BuiltInOfferConfig
  switch (o.type) {
    case 'discount':
      return {
        headline: `How about ${o.percent}% off?`,
        body: `We'd like to offer you ${o.percent}% off for ${o.months} month${o.months === 1 ? '' : 's'}.`,
        cta: 'Accept offer',
        declineCta: 'No thanks',
      }
    case 'pause':
      return {
        headline: 'Take a break instead?',
        body: `Pause your subscription for up to ${o.months} month${o.months === 1 ? '' : 's'}.`,
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
        body: `We'll extend your trial by ${o.days} day${o.days === 1 ? '' : 's'}.`,
        cta: 'Extend trial',
        declineCta: 'No thanks',
      }
    case 'contact':
      return {
        headline: 'Talk to us first?',
        body: 'Our team would love to help resolve any issues.',
        cta: o.label ?? 'Contact support',
        declineCta: 'No thanks',
      }
    case 'redirect':
      return {
        headline: 'Before you go...',
        body: 'Check this out — it might change your mind.',
        cta: o.label,
        declineCta: 'No thanks',
      }
    default:
      return {
        headline: 'Before you go...',
        body: "We'd like to offer you something.",
        cta: 'Accept',
        declineCta: 'No thanks',
      }
  }
}

export function buildOfferDecision(
  apiOffer: BlueprintOffer,
  coupons: EmbedCoupon[],
  plans: EmbedPlan[],
): OfferDecision | null {
  const offerConfig = transformOffer(apiOffer, coupons, plans)
  if (!offerConfig) return null

  return {
    ...offerConfig,
    copy: buildOfferCopy(apiOffer, offerConfig),
    decisionId: apiOffer.guid,
  }
}
