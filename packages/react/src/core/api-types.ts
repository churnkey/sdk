// Wire shape returned from the cancel-flow config endpoint in token mode.
// Customer and subscription data uses the same Direct shape the SDK accepts
// as input, so consumers see one consistent type. Steps and offers arrive
// fully resolved — coupon ids already hydrated, plan ids already inlined.

import type { DirectCustomer, DirectSubscription, PlanOption } from './types'

export interface SdkConfig {
  blueprintId: string
  steps: SdkStep[]
  customer: DirectCustomer
  subscriptions: DirectSubscription[]
  settings: SdkSettings
  /** Bandit key used for auto-optimization, if it ran. */
  autoOptimizationKey?: string
}

export interface SdkSettings {
  clickToCancelEnabled: boolean
  strictFTCComplianceEnabled: boolean
  discountCooldown?: number
  pauseCooldown?: number
}

export type SdkStep = SdkSurveyStep | SdkOfferStep | SdkFeedbackStep | SdkConfirmStep

interface SdkStepBase {
  guid: string
  title?: string
  description?: string
}

export interface SdkSurveyStep extends SdkStepBase {
  type: 'survey'
  reasons: SdkReason[]
}

export interface SdkOfferStep extends SdkStepBase {
  type: 'offer'
  offer: SdkOffer
}

export interface SdkFeedbackStep extends SdkStepBase {
  type: 'feedback'
  placeholder?: string
  required?: boolean
  minLength?: number
}

export interface SdkConfirmStep extends SdkStepBase {
  type: 'confirm'
}

export interface SdkReason {
  id: string
  label: string
  freeform?: boolean
  offer?: SdkOffer
}

export type SdkOffer =
  | SdkDiscountOffer
  | SdkPauseOffer
  | SdkPlanChangeOffer
  | SdkTrialExtensionOffer
  | SdkRedirectOffer
  | SdkContactOffer

interface SdkOfferBase {
  /** Per-offer guid — used for analytics joins between presented and accepted offers. */
  decisionId?: string
  copy: SdkOfferCopy
}

export interface SdkDiscountOffer extends SdkOfferBase {
  type: 'discount'
  couponId?: string
  percentOff?: number
  /** Smallest currency unit (cents for USD, etc.). */
  amountOff?: number
  currency?: string
  durationInMonths?: number
}

export interface SdkPauseOffer extends SdkOfferBase {
  type: 'pause'
  months: number
  interval: 'month' | 'week'
  datePicker?: boolean
}

export interface SdkPlanChangeOffer extends SdkOfferBase {
  type: 'plan_change'
  plans: PlanOption[]
}

export interface SdkTrialExtensionOffer extends SdkOfferBase {
  type: 'trial_extension'
  days: number
}

export interface SdkRedirectOffer extends SdkOfferBase {
  type: 'redirect'
  url: string
  label?: string
}

export interface SdkContactOffer extends SdkOfferBase {
  type: 'contact'
  url?: string
  label?: string
}

export interface SdkOfferCopy {
  headline: string
  body: string
  cta: string
  declineCta: string
}
