// Types mirroring the Churnkey embed API response shape.

export interface EmbedResponse {
  blueprint: BlueprintConfig
  coupons: EmbedCoupon[]
  offerPlans: EmbedPlan[]
  customer: EmbedCustomer | null
  sessions: EmbedSession[]
  branding?: Record<string, unknown>
  orgTranslations?: Record<string, unknown>
  dynamicOffers?: {
    discount?: { couponId?: string }
    planChange?: { planIds?: string[] }
  }
  clickToCancelEnabled?: boolean
  strictFTCComplianceEnabled?: boolean
  autoOptimizationUsed?: boolean
  autoOptimizationKey?: string
}

export interface BlueprintConfig {
  _id: string
  name?: string
  guid?: string
  steps: BlueprintStep[]
  discountCooldown?: number
  pauseCooldown?: number
}

export interface BlueprintStep {
  stepType: 'OFFER' | 'SURVEY' | 'CONFIRM' | 'FREEFORM'
  enabled?: boolean
  guid?: string
  offer?: BlueprintOffer
  header?: string
  description?: string
  survey?: {
    choices: BlueprintSurveyChoice[]
    randomize?: boolean
  }
  freeform?: {
    minLength?: number
    placeholder?: string
    required?: boolean
  }
  confirm?: {
    acknowledgement?: boolean
    acknowledgementText?: string
  }
}

export interface BlueprintOffer {
  offerType: 'DISCOUNT' | 'PAUSE' | 'PLAN_CHANGE' | 'TRIAL_EXTENSION' | 'REDIRECT' | 'CONTACT'
  guid?: string
  header?: string
  description?: string
  ctaText?: string
  declineText?: string
  discountConfig?: {
    couponId: string
    autoOptimize?: boolean
    customAmount?: number
    customDuration?: number
  }
  pauseConfig?: {
    options?: Array<{ duration: number; interval: 'day' | 'week' | 'month' | 'year' }>
    datePicker?: boolean
    maxPauseLength?: number
    pauseInterval?: string
  }
  planChangeConfig?: {
    options: string[]
  }
  trialExtensionConfig?: {
    trialExtensionDays: number
  }
  redirectConfig?: {
    redirectUrl: string
    redirectLabel?: string
  }
}

export interface BlueprintSurveyChoice {
  id?: string
  guid?: string
  value: string
  followup?: boolean
  followupQuestion?: string
  followupOptions?: Array<{ value: string; guid?: string }>
  offer?: BlueprintOffer
}

export interface EmbedCoupon {
  id: string
  couponType: 'PERCENT' | 'AMOUNT'
  couponAmount: number
  couponDuration?: number
  name?: string
}

export interface EmbedPlan {
  id: string
  name?: string
  price?: number
  interval?: 'day' | 'week' | 'month' | 'year'
  intervalCount?: number
  currency?: string
  features?: string[]
  active?: boolean
  productId?: string
}

export interface EmbedCustomer {
  id: string
  email?: string
  currency?: string
  subscriptions?: {
    data: Array<{
      id: string
      status: string
      current_period_end?: number
      plan?: {
        id: string
        amount?: number
        interval?: string
        currency?: string
      }
      items?: {
        data: Array<{
          id: string
          price?: {
            id: string
            unit_amount?: number
            currency?: string
            recurring?: {
              interval?: string
              interval_count?: number
            }
          }
          quantity?: number
        }>
      }
      trial_end?: number
      cancel_at_period_end?: boolean
      discount?: {
        coupon?: {
          id: string
          percent_off?: number
          amount_off?: number
        }
      }
    }>
  }
  decorated?: {
    customerSubscription?: Record<string, unknown>
    customAttributes?: Record<string, unknown>
  }
}

export interface EmbedSession {
  _id: string
  createdAt?: string
  acceptedOffer?: {
    offerType: string
  }
}
