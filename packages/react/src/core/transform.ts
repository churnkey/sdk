// Translate the SdkConfig response (token mode) into the runtime Step shape
// the rest of the SDK works with. Token-mode flows arrive with offers fully
// resolved — coupon ids hydrated to amounts and durations, plan ids inlined
// as DirectPrice[], so this layer is a pure shape projection.

import type { SdkConfig, SdkDiscountOffer, SdkOffer, SdkReason, SdkStep } from './api-types'
import type { BuiltInOfferConfig, OfferConfig, OfferCopy, OfferDecision, ReasonConfig, Step } from './types'

export interface TransformResult {
  steps: Step[]
  blueprintId: string
  metadata: {
    autoOptimizationKey?: string
  }
}

export function transformSdkConfig(config: SdkConfig): TransformResult {
  return {
    steps: config.steps.map(transformStep),
    blueprintId: config.blueprintId,
    metadata: {
      autoOptimizationKey: config.autoOptimizationKey,
    },
  }
}

function transformStep(step: SdkStep): Step {
  switch (step.type) {
    case 'survey':
      return {
        type: 'survey',
        guid: step.guid,
        title: step.title,
        description: step.description,
        reasons: step.reasons.map(transformReason),
      }
    case 'offer':
      return {
        type: 'offer',
        guid: step.guid,
        title: step.title,
        description: step.description,
        offer: transformOfferDecision(step.offer),
      }
    case 'feedback':
      return {
        type: 'feedback',
        guid: step.guid,
        title: step.title,
        description: step.description,
        placeholder: step.placeholder,
        required: step.required,
        minLength: step.minLength,
      }
    case 'confirm':
      return {
        type: 'confirm',
        guid: step.guid,
        title: step.title,
        description: step.description,
      }
  }
}

function transformReason(r: SdkReason): ReasonConfig {
  const out: ReasonConfig = {
    id: r.id,
    label: r.label,
    freeform: r.freeform,
  }
  if (r.offer) out.offer = transformOfferConfig(r.offer)
  return out
}

function transformOfferDecision(o: SdkOffer): OfferDecision {
  return { ...transformOfferConfig(o), copy: o.copy, decisionId: o.decisionId }
}

function transformOfferConfig(o: SdkOffer): OfferConfig {
  switch (o.type) {
    case 'discount': {
      const d: SdkDiscountOffer = o
      return {
        type: 'discount',
        couponId: d.couponId,
        percentOff: d.percentOff,
        amountOff: d.amountOff,
        currency: d.currency,
        durationInMonths: d.durationInMonths,
      }
    }
    case 'pause':
      return {
        type: 'pause',
        months: o.months,
        interval: o.interval,
        datePicker: o.datePicker,
      }
    case 'plan_change':
      return {
        type: 'plan_change',
        plans: o.plans,
      }
    case 'trial_extension':
      return {
        type: 'trial_extension',
        days: o.days,
      }
    case 'redirect':
      return {
        type: 'redirect',
        url: o.url,
        label: o.label ?? '',
      }
    case 'contact':
      return {
        type: 'contact',
        url: o.url,
        label: o.label,
      }
  }
}

/**
 * Default offer copy used by step-graph.ts when a local-mode offer doesn't
 * include explicit copy. Token-mode offers come with copy already filled in
 * by the server, so this only fires for local mode.
 */
export function defaultOfferCopy(offer: OfferConfig): OfferCopy {
  const o = offer as BuiltInOfferConfig
  switch (o.type) {
    case 'discount':
      return {
        headline: o.percentOff != null ? `How about ${o.percentOff}% off?` : 'Special offer',
        body: discountBody(o),
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

function discountBody(o: { percentOff?: number; durationInMonths?: number }): string {
  if (o.percentOff == null) return "We'd like to offer you a discount."
  const months = o.durationInMonths ?? 1
  return `We'd like to offer you ${o.percentOff}% off for ${months} month${months === 1 ? '' : 's'}.`
}
