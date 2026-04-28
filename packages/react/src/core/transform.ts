import type {
  BlueprintOffer,
  BlueprintStep,
  BlueprintSurveyChoice,
  EmbedCoupon,
  EmbedPlan,
  EmbedResponse,
} from './api-types'
import { applyMergeFields, buildMergeAttrs, type MergeAttrs } from './merge-fields'
import type { BuiltInOfferConfig, OfferConfig, OfferCopy, OfferDecision, Plan, ReasonConfig, Step } from './types'

export interface TransformResult {
  steps: Step[]
  blueprintId: string
  metadata: {
    autoOptimizationKey?: string
    autoOptimizationUsed?: boolean
  }
}

export function transformEmbedResponse(response: EmbedResponse): TransformResult {
  const { blueprint, coupons, offerPlans } = response
  const enabledSteps = blueprint.steps.filter((s) => s.enabled !== false)
  const attrs = buildMergeAttrs(response.customer)

  return {
    steps: transformSteps(enabledSteps, coupons, offerPlans, attrs),
    blueprintId: blueprint._id,
    metadata: {
      autoOptimizationKey: response.autoOptimizationKey,
      autoOptimizationUsed: response.autoOptimizationUsed,
    },
  }
}

function transformSteps(
  apiSteps: BlueprintStep[],
  coupons: EmbedCoupon[],
  plans: EmbedPlan[],
  attrs: MergeAttrs = {},
): Step[] {
  const steps: Step[] = []
  const merge = (text: string | undefined) => (text ? applyMergeFields(text, attrs) : text)

  for (const apiStep of apiSteps) {
    switch (apiStep.stepType) {
      case 'SURVEY':
        steps.push({
          type: 'survey',
          guid: apiStep.guid,
          title: merge(apiStep.header),
          description: merge(apiStep.description),
          reasons: transformReasons(apiStep.survey?.choices ?? [], coupons, plans, attrs),
        })
        break

      case 'OFFER': {
        const offer = apiStep.offer
          ? (buildOfferDecision(apiStep.offer, coupons, plans, attrs) ?? undefined)
          : undefined
        steps.push({
          type: 'offer',
          guid: apiStep.guid,
          title: merge(apiStep.header),
          description: merge(apiStep.description),
          offer,
        })
        break
      }

      case 'FREEFORM':
        steps.push({
          type: 'feedback',
          guid: apiStep.guid,
          title: merge(apiStep.header),
          description: merge(apiStep.description),
          placeholder: apiStep.freeform?.placeholder,
          required: apiStep.freeform?.required,
          minLength: apiStep.freeform?.minLength,
        })
        break

      case 'CONFIRM':
        steps.push({
          type: 'confirm',
          guid: apiStep.guid,
          title: merge(apiStep.header),
          description: merge(apiStep.description),
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
  attrs: MergeAttrs = {},
): ReasonConfig[] {
  return choices.map((choice, index) => {
    const id = choice.guid ?? choice.id ?? `reason-${index}`
    const reason: ReasonConfig = {
      id,
      label: applyMergeFields(choice.value, attrs),
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

export function buildOfferCopy(apiOffer: BlueprintOffer, offerConfig: OfferConfig, attrs: MergeAttrs = {}): OfferCopy {
  const defaults = defaultOfferCopy(offerConfig)
  const resolve = (text: string | undefined, fallback: string) => (text ? applyMergeFields(text, attrs) : fallback)
  return {
    headline: resolve(apiOffer.header, defaults.headline),
    body: resolve(apiOffer.description, defaults.body),
    cta: resolve(apiOffer.ctaText, defaults.cta),
    declineCta: resolve(apiOffer.declineText, defaults.declineCta),
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
  attrs: MergeAttrs = {},
): OfferDecision | null {
  const offerConfig = transformOffer(apiOffer, coupons, plans)
  if (!offerConfig) return null

  return {
    ...offerConfig,
    copy: buildOfferCopy(apiOffer, offerConfig, attrs),
    decisionId: apiOffer.guid,
  }
}
