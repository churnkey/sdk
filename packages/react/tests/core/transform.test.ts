import { describe, expect, it } from 'vitest'
import type {
  BlueprintOffer,
  BlueprintSurveyChoice,
  EmbedCoupon,
  EmbedPlan,
  EmbedResponse,
} from '../../src/core/api-types'
import {
  buildOfferCopy,
  buildOfferDecision,
  transformEmbedResponse,
  transformOffer,
  transformReasons,
} from '../../src/core/transform'

function makeCoupon(overrides: Partial<EmbedCoupon> = {}): EmbedCoupon {
  return {
    id: 'coupon_20pct',
    couponType: 'PERCENT',
    couponAmount: 20,
    couponDuration: 3,
    ...overrides,
  }
}

function makePlan(overrides: Partial<EmbedPlan> = {}): EmbedPlan {
  return {
    id: 'plan_starter',
    name: 'Starter',
    price: 900, // cents
    interval: 'month',
    currency: 'USD',
    features: ['1 user', '5 projects'],
    ...overrides,
  }
}

function makeEmbedResponse(overrides: Partial<EmbedResponse> = {}): EmbedResponse {
  return {
    blueprint: {
      _id: 'bp_123',
      steps: [
        {
          stepType: 'SURVEY',
          enabled: true,
          header: 'Why are you leaving?',
          survey: {
            choices: [
              {
                guid: 'reason_expensive',
                value: 'Too expensive',
                offer: {
                  offerType: 'DISCOUNT',
                  guid: 'offer_1',
                  header: 'Special deal!',
                  description: 'Get 20% off for 3 months.',
                  ctaText: 'Apply discount',
                  declineText: 'Skip',
                  discountConfig: { couponId: 'coupon_20pct' },
                },
              },
              {
                guid: 'reason_not_using',
                value: 'Not using it enough',
                offer: {
                  offerType: 'PAUSE',
                  guid: 'offer_2',
                  pauseConfig: {
                    options: [{ duration: 2, interval: 'month' }],
                  },
                },
              },
              {
                guid: 'reason_other',
                value: 'Other',
              },
            ],
          },
        },
        {
          stepType: 'FREEFORM',
          enabled: true,
          header: 'Tell us more',
          freeform: { minLength: 10, placeholder: 'Type here...' },
        },
        {
          stepType: 'CONFIRM',
          enabled: true,
          header: 'Are you sure?',
        },
      ],
    },
    coupons: [makeCoupon()],
    offerPlans: [makePlan()],
    customer: null,
    sessions: [],
    ...overrides,
  }
}

describe('transformEmbedResponse', () => {
  it('transforms blueprint into ordered SDK steps', () => {
    const result = transformEmbedResponse(makeEmbedResponse())

    expect(result.blueprintId).toBe('bp_123')
    expect(result.steps).toHaveLength(3) // survey + feedback + confirm
    const surveyStep = result.steps.find((s) => s.type === 'survey')
    expect(surveyStep && 'reasons' in surveyStep ? surveyStep.reasons : []).toHaveLength(3)
  })

  it('includes autoOptimization metadata', () => {
    const response = makeEmbedResponse({
      autoOptimizationUsed: true,
      autoOptimizationKey: 'bandit_key_1',
    })
    const result = transformEmbedResponse(response)

    expect(result.metadata.autoOptimizationUsed).toBe(true)
    expect(result.metadata.autoOptimizationKey).toBe('bandit_key_1')
  })

  it('filters disabled steps', () => {
    const response = makeEmbedResponse()
    response.blueprint.steps[1].enabled = false // disable FREEFORM
    const result = transformEmbedResponse(response)

    expect(result.steps.find((s) => s.type === 'feedback')).toBeUndefined()
  })

  it('does not inject a confirm step if the blueprint omits one', () => {
    const response = makeEmbedResponse()
    response.blueprint.steps = [response.blueprint.steps[0]] // only SURVEY
    const result = transformEmbedResponse(response)

    expect(result.steps.find((s) => s.type === 'confirm')).toBeUndefined()
  })
})

describe('transformReasons', () => {
  const coupons = [makeCoupon()]
  const plans = [makePlan()]

  it('transforms choices to reasons', () => {
    const choices: BlueprintSurveyChoice[] = [
      { guid: 'r1', value: 'Too expensive' },
      { guid: 'r2', value: 'Not using it' },
    ]
    const reasons = transformReasons(choices, coupons, plans)

    expect(reasons).toHaveLength(2)
    expect(reasons[0].id).toBe('r1')
    expect(reasons[0].label).toBe('Too expensive')
    expect(reasons[0].offer).toBeUndefined()
  })

  it('attaches discount offer from coupon', () => {
    const choices: BlueprintSurveyChoice[] = [
      {
        guid: 'r1',
        value: 'Expensive',
        offer: {
          offerType: 'DISCOUNT',
          discountConfig: { couponId: 'coupon_20pct' },
        },
      },
    ]
    const reasons = transformReasons(choices, coupons, plans)

    expect(reasons[0].offer).toEqual({
      type: 'discount',
      percent: 20,
      months: 3,
      couponId: 'coupon_20pct',
    })
  })

  it('uses fallback id when guid is missing', () => {
    const choices: BlueprintSurveyChoice[] = [{ value: 'No guid' }]
    const reasons = transformReasons(choices, coupons, plans)
    expect(reasons[0].id).toBe('reason-0')
  })
})

describe('transformOffer', () => {
  const coupons = [makeCoupon()]
  const plans = [makePlan(), makePlan({ id: 'plan_pro', name: 'Pro', price: 2900, features: undefined })]

  it('transforms DISCOUNT offer', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'DISCOUNT',
      discountConfig: { couponId: 'coupon_20pct' },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toEqual({
      type: 'discount',
      percent: 20,
      months: 3,
      couponId: 'coupon_20pct',
    })
  })

  it('returns undefined for DISCOUNT with missing coupon', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'DISCOUNT',
      discountConfig: { couponId: 'nonexistent' },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toBeUndefined()
  })

  it('transforms PAUSE offer', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'PAUSE',
      pauseConfig: {
        options: [{ duration: 3, interval: 'month' }],
      },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toEqual({
      type: 'pause',
      months: 3,
      interval: 'month',
      datePicker: undefined,
    })
  })

  it('transforms PAUSE with datePicker', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'PAUSE',
      pauseConfig: {
        maxPauseLength: 2,
        pauseInterval: 'week',
        datePicker: true,
      },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toEqual({
      type: 'pause',
      months: 2,
      interval: 'week',
      datePicker: true,
    })
  })

  it('transforms PLAN_CHANGE offer', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'PLAN_CHANGE',
      planChangeConfig: { options: ['plan_starter', 'plan_pro'] },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toEqual({
      type: 'plan_change',
      plans: [
        {
          id: 'plan_starter',
          name: 'Starter',
          price: 9,
          interval: 'month',
          currency: 'USD',
          features: ['1 user', '5 projects'],
        },
        { id: 'plan_pro', name: 'Pro', price: 29, interval: 'month', currency: 'USD', features: undefined },
      ],
    })
  })

  it('returns undefined for PLAN_CHANGE with no matching plans', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'PLAN_CHANGE',
      planChangeConfig: { options: ['nonexistent'] },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toBeUndefined()
  })

  it('transforms TRIAL_EXTENSION offer', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'TRIAL_EXTENSION',
      trialExtensionConfig: { trialExtensionDays: 14 },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toEqual({ type: 'trial_extension', days: 14 })
  })

  it('transforms REDIRECT offer', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'REDIRECT',
      redirectConfig: { redirectUrl: 'https://example.com', redirectLabel: 'Check this' },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toEqual({ type: 'redirect', url: 'https://example.com', label: 'Check this' })
  })

  it('returns undefined for REDIRECT without URL', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'REDIRECT',
      redirectConfig: { redirectUrl: '' },
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toBeUndefined()
  })

  it('transforms CONTACT offer', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'CONTACT',
    }
    const offer = transformOffer(apiOffer, coupons, plans)

    expect(offer).toEqual({ type: 'contact' })
  })
})

describe('buildOfferCopy', () => {
  it('prefers blueprint copy over defaults', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'DISCOUNT',
      header: 'Custom headline',
      description: 'Custom body',
      ctaText: 'Custom CTA',
      declineText: 'Custom decline',
    }
    const copy = buildOfferCopy(apiOffer, { type: 'discount', percent: 20, months: 3 })

    expect(copy.headline).toBe('Custom headline')
    expect(copy.body).toBe('Custom body')
    expect(copy.cta).toBe('Custom CTA')
    expect(copy.declineCta).toBe('Custom decline')
  })

  it('falls back to defaults when blueprint copy is missing', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'DISCOUNT',
    }
    const copy = buildOfferCopy(apiOffer, { type: 'discount', percent: 25, months: 2 })

    expect(copy.headline).toContain('25%')
    expect(copy.body).toContain('2 months')
    expect(copy.cta).toBe('Accept offer')
    expect(copy.declineCta).toBe('No thanks')
  })

  it('uses partial blueprint copy with fallbacks', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'PAUSE',
      header: 'Take a breather',
      // no description, ctaText, declineText
    }
    const copy = buildOfferCopy(apiOffer, { type: 'pause', months: 1 })

    expect(copy.headline).toBe('Take a breather')
    expect(copy.body).toContain('1 month')
    expect(copy.cta).toBe('Pause subscription')
    expect(copy.declineCta).toBe('No thanks')
  })
})

describe('buildOfferDecision', () => {
  const coupons = [makeCoupon()]
  const plans = [makePlan()]

  it('builds a complete OfferDecision', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'DISCOUNT',
      guid: 'decision_1',
      header: 'Great deal!',
      discountConfig: { couponId: 'coupon_20pct' },
    }
    const decision = buildOfferDecision(apiOffer, coupons, plans)

    expect(decision).not.toBeNull()
    expect(decision!.type).toBe('discount')
    expect(decision!.decisionId).toBe('decision_1')
    expect(decision!.copy.headline).toBe('Great deal!')
    // OfferDecision is flattened — fields are on the object directly, not in params
    expect((decision as any).percent).toBe(20)
    expect((decision as any).months).toBe(3)
    expect((decision as any).couponId).toBe('coupon_20pct')
  })

  it('returns null when offer cannot be transformed', () => {
    const apiOffer: BlueprintOffer = {
      offerType: 'DISCOUNT',
      discountConfig: { couponId: 'nonexistent' },
    }
    const decision = buildOfferDecision(apiOffer, coupons, plans)

    expect(decision).toBeNull()
  })
})
