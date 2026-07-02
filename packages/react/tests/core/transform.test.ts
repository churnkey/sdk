import { describe, expect, it } from 'vitest'
import type { SdkConfig } from '../../src/core/api-types'
import { transformSdkConfig } from '../../src/core/transform'

describe('transformSdkConfig', () => {
  it('passes through blueprintId and autoOptimizationKey', () => {
    const config: SdkConfig = {
      blueprintId: 'bp_123',
      steps: [],
      customer: { id: 'cus_1' },
      subscriptions: [],
      settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
      autoOptimizationKey: 'bandit-a',
    }
    const result = transformSdkConfig(config)
    expect(result.blueprintId).toBe('bp_123')
    expect(result.metadata.autoOptimizationKey).toBe('bandit-a')
  })

  it('projects survey + offer + feedback + confirm steps to local Step shape', () => {
    const config: SdkConfig = {
      blueprintId: 'bp_1',
      steps: [
        {
          type: 'survey',
          guid: 's1',
          title: 'Why?',
          reasons: [
            { id: 'r1', label: 'Too expensive' },
            {
              id: 'r2',
              label: 'Not using it',
              offer: {
                type: 'discount',
                couponId: 'c_1',
                percentOff: 20,
                durationInMonths: 3,
                copy: { headline: 'Stay', body: '20% off', cta: 'Accept', declineCta: 'No thanks' },
              },
            },
          ],
        },
        { type: 'feedback', guid: 'f1', placeholder: 'Tell us more' },
        { type: 'confirm', guid: 'c1' },
      ],
      customer: { id: 'cus_1' },
      subscriptions: [],
      settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
    }

    const { steps } = transformSdkConfig(config)
    expect(steps).toHaveLength(3)
    expect(steps[0].type).toBe('survey')
    expect((steps[0] as { reasons: { id: string }[] }).reasons.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(steps[1].type).toBe('feedback')
    expect(steps[2].type).toBe('confirm')
  })

  it('preserves resolved discount fields on the step-attached offer', () => {
    const config: SdkConfig = {
      blueprintId: 'bp_1',
      steps: [
        {
          type: 'offer',
          guid: 'o1',
          offer: {
            type: 'discount',
            couponId: 'c_1',
            percentOff: 25,
            durationInMonths: 6,
            copy: { headline: 'h', body: 'b', cta: 'cta', declineCta: 'no' },
          },
        },
      ],
      customer: { id: 'cus_1' },
      subscriptions: [],
      settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
    }

    const { steps } = transformSdkConfig(config)
    const offerStep = steps[0] as {
      offer: { type: string; percentOff?: number; durationInMonths?: number; copy: unknown }
    }
    expect(offerStep.offer.type).toBe('discount')
    expect(offerStep.offer.percentOff).toBe(25)
    expect(offerStep.offer.durationInMonths).toBe(6)
    expect(offerStep.offer.copy).toEqual({ headline: 'h', body: 'b', cta: 'cta', declineCta: 'no' })
  })

  it('preserves resolved rebate fields on the step-attached offer', () => {
    const config: SdkConfig = {
      blueprintId: 'bp_1',
      steps: [
        {
          type: 'offer',
          guid: 'o1',
          offer: {
            type: 'rebate',
            amountMinor: 1000,
            currency: 'usd',
            amountPaidMinor: 9900,
            netAfterRebateMinor: 8900,
            paymentMethodBrand: 'Visa',
            paymentMethodLast4: '4242',
            copy: { headline: 'h', body: 'b', cta: 'cta', declineCta: 'no' },
          },
        },
      ],
      customer: { id: 'cus_1' },
      subscriptions: [],
      settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
    }

    const { steps } = transformSdkConfig(config)
    const offer = (
      steps[0] as {
        offer: { type: string; amountMinor: number; netAfterRebateMinor?: number; paymentMethodLast4?: string }
      }
    ).offer
    expect(offer.type).toBe('rebate')
    expect(offer.amountMinor).toBe(1000)
    expect(offer.netAfterRebateMinor).toBe(8900)
    expect(offer.paymentMethodLast4).toBe('4242')
  })

  it('inlines plan_change plans as DirectPrice[]', () => {
    const config: SdkConfig = {
      blueprintId: 'bp_1',
      steps: [
        {
          type: 'offer',
          guid: 'o1',
          offer: {
            type: 'plan_change',
            plans: [
              {
                id: 'plan_pro',
                name: 'Pro',
                amount: { value: 4999, currency: 'usd' },
                duration: { interval: 'month' },
              },
            ],
            copy: { headline: 'Switch?', body: '', cta: 'Switch', declineCta: 'No' },
          },
        },
      ],
      customer: { id: 'cus_1' },
      subscriptions: [],
      settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
    }

    const { steps } = transformSdkConfig(config)
    const offer = (steps[0] as { offer: { type: string; plans: { id: string; amount: { value: number } }[] } }).offer
    expect(offer.type).toBe('plan_change')
    expect(offer.plans).toHaveLength(1)
    expect(offer.plans[0].id).toBe('plan_pro')
    expect(offer.plans[0].amount.value).toBe(4999)
  })

  it('passes a merchant-defined offer through with its type key, data, copy, and decisionId', () => {
    // The custom offer isn't part of the SdkOffer union (see SdkCustomOffer),
    // so the fixture is cast — same shape the wire actually carries.
    const config = {
      blueprintId: 'bp_1',
      steps: [
        {
          type: 'offer',
          guid: 'o1',
          offer: {
            type: 'annual_term_extension',
            data: { days: 30 },
            decisionId: 'dec_1',
            copy: { headline: 'Extend your term', body: 'On us', cta: 'Accept', declineCta: 'No thanks' },
          },
        },
      ],
      customer: { id: 'cus_1' },
      subscriptions: [],
      settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
    } as unknown as SdkConfig

    const { steps } = transformSdkConfig(config)
    const offer = (
      steps[0] as {
        offer: { type: string; data?: Record<string, unknown>; decisionId?: string; copy: { headline: string } }
      }
    ).offer
    expect(offer.type).toBe('annual_term_extension')
    expect(offer.data).toEqual({ days: 30 })
    expect(offer.decisionId).toBe('dec_1')
    expect(offer.copy.headline).toBe('Extend your term')
  })

  it('passes a custom offer with no data through as a bare type', () => {
    const config = {
      blueprintId: 'bp_1',
      steps: [
        {
          type: 'offer',
          guid: 'o1',
          offer: {
            type: 'winback_call',
            decisionId: 'dec_2',
            copy: { headline: 'Talk to us', body: '', cta: 'Accept', declineCta: 'No thanks' },
          },
        },
      ],
      customer: { id: 'cus_1' },
      subscriptions: [],
      settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
    } as unknown as SdkConfig

    const { steps } = transformSdkConfig(config)
    const offer = (steps[0] as { offer: { type: string; data?: unknown } }).offer
    expect(offer.type).toBe('winback_call')
    expect('data' in offer).toBe(false)
  })
})
