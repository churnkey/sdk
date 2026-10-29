// Translate the SdkConfig response (token mode) into the runtime Step shape
// the rest of the SDK works with. Token-mode flows arrive with offers fully
// resolved — coupon ids hydrated to amounts and durations, plan ids inlined
// as DirectPrice[], so this layer is a pure shape projection.

import type { SdkConfig, SdkCustomOffer, SdkDiscountOffer, SdkOffer, SdkReason, SdkStep } from './api-types'
import { type CancelFlowMessages, formatMessage } from './messages'
import type { BuiltInOfferConfig, OfferConfig, OfferCopy, OfferDecision, ReasonConfig, Step } from './types'
import { BUILT_IN_OFFER_TYPES } from './utils'

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
  }
  if (r.freeform) out.freeform = true
  // Keep the full decision — server-resolved copy and decisionId — so
  // survey-attached offers render dashboard copy instead of the synthesized
  // defaults, and presented/accepted analytics join on decisionId.
  if (r.offer) out.offer = transformOfferDecision(r.offer)
  return out
}

function transformOfferDecision(o: SdkOffer): OfferDecision {
  const decision: OfferDecision = { ...transformOfferConfig(o), copy: o.copy, decisionId: o.decisionId }
  if (o.stackedOffer) decision.stackedOffer = transformOfferDecision(o.stackedOffer)
  return decision
}

function transformOfferConfig(o: SdkOffer): OfferConfig {
  // Merchant-defined offers: `type` is the registered key and `data` the
  // builder's config. Pass both through untouched so the renderer can match
  // customComponents[type].
  if (!BUILT_IN_OFFER_TYPES.includes(o.type)) {
    const custom = o as unknown as SdkCustomOffer
    return custom.data !== undefined ? { type: custom.type, data: custom.data } : { type: custom.type }
  }
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
    case 'rebate':
      return {
        type: 'rebate',
        amountMinor: o.amountMinor,
        currency: o.currency,
        amountPaidMinor: o.amountPaidMinor,
        netAfterRebateMinor: o.netAfterRebateMinor,
        paymentMethodBrand: o.paymentMethodBrand,
        paymentMethodLast4: o.paymentMethodLast4,
      }
  }
}

/**
 * Copy for a local-mode offer declared without `copy`, from the catalog's
 * `offer.defaultCopy`, so it is in the chrome's language. Connected-mode
 * offers arrive with copy from the server.
 */
export function defaultOfferCopy(offer: OfferConfig, messages: CancelFlowMessages): OfferCopy {
  const o = offer as BuiltInOfferConfig
  const text = messages.offer.defaultCopy
  const declineCta = text.declineCta
  switch (o.type) {
    case 'discount': {
      if (o.percentOff == null) {
        return {
          headline: text.discount.headlineNoAmount,
          body: text.discount.bodyNoAmount,
          cta: text.discount.cta,
          declineCta,
        }
      }
      const months = o.durationInMonths ?? 1
      const vars = {
        percent: o.percentOff,
        months,
        unit: months === 1 ? messages.common.month : messages.common.months,
      }
      return {
        headline: formatMessage(text.discount.headline, vars),
        body: formatMessage(text.discount.body, vars),
        cta: text.discount.cta,
        declineCta,
      }
    }
    case 'pause': {
      const unit = o.months === 1 ? messages.common.month : messages.common.months
      return { ...text.pause, body: formatMessage(text.pause.body, { months: o.months, unit }), declineCta }
    }
    case 'plan_change':
      return { ...text.plan_change, declineCta }
    case 'trial_extension': {
      const unit = o.days === 1 ? messages.common.day : messages.common.days
      return {
        ...text.trial_extension,
        body: formatMessage(text.trial_extension.body, { days: o.days, unit }),
        declineCta,
      }
    }
    case 'contact':
      return { ...text.contact, cta: o.label ?? text.contact.cta, declineCta }
    case 'redirect':
      return { ...text.redirect, cta: o.label, declineCta }
    case 'rebate':
      return { ...text.rebate, declineCta }
    default:
      return { ...text.custom, declineCta }
  }
}
