import type { SdkConfig } from './api-types'
import type { SessionCredentials } from './token'
import type { DirectCustomer, DirectSubscription } from './types'

const DEFAULT_BASE_URL = 'https://api.churnkey.co/v1'

// Wire enums accepted by the API. Literal unions so payload builders fail
// at compile time if they emit a value outside the accepted set.
export type ApiStepType = 'OFFER' | 'SURVEY' | 'CONFIRM' | 'FREEFORM' | 'CUSTOM'
export type ApiOfferType = 'DISCOUNT' | 'PAUSE' | 'PLAN_CHANGE' | 'TRIAL_EXTENSION' | 'CONTACT' | 'REDIRECT' | 'CUSTOM'
export type ApiPauseInterval = 'MONTH' | 'WEEK'
export type ApiCouponType = 'PERCENT' | 'AMOUNT'
export type ApiBillingInterval = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
export type ApiMode = 'LIVE' | 'TEST'

export interface StepViewed {
  stepType: ApiStepType
  // Populated iff stepType === 'CUSTOM' — holds the SDK step name.
  customStepType?: string
  guid?: string
  numChoices?: number
  start: string
  end?: string
  duration?: number
}

export interface PresentedOffer {
  guid?: string
  offerType?: ApiOfferType
  // Populated iff offerType === 'CUSTOM' — holds the SDK offer name.
  customOfferType?: string
  accepted: boolean
  presentedAt: string
  acceptedAt?: string
  declinedAt?: string
  [key: string]: unknown
}

export interface AcceptedOfferPayload {
  guid?: string
  offerType: ApiOfferType
  // Populated iff offerType === 'CUSTOM' — holds the SDK offer name.
  customOfferType?: string
  // Populated iff offerType === 'CUSTOM' — the result arg passed to
  // `onAccept(result)` from the custom offer component.
  customOfferResult?: Record<string, unknown>
  couponId?: string
  couponType?: ApiCouponType
  couponAmount?: number
  couponDuration?: number
  pauseDuration?: number
  pauseInterval?: ApiPauseInterval
  newPlanId?: string
  newPlanPrice?: number
  trialExtensionDays?: number
  redirectUrl?: string
}

export interface SessionCustomer {
  id: string
  email?: string
  subscriptionId?: string
  planId?: string
  planPrice?: number
  currency?: string
  billingInterval?: ApiBillingInterval
  created?: string
  onTrial?: boolean
  customAttributes?: Record<string, unknown>
}

export interface SessionPayload {
  blueprintId?: string
  surveyId?: string
  customer?: SessionCustomer
  canceled?: boolean
  aborted?: boolean
  surveyChoiceId?: string
  surveyChoiceValue?: string
  feedback?: string
  acceptedOffer?: AcceptedOfferPayload
  presentedOffers?: PresentedOffer[]
  stepsViewed?: StepViewed[]
  customStepResults?: Record<string, unknown>
  mode: ApiMode
  provider?: string
  embedVersion?: string
  // Token-mode session-record fields. Populated automatically when the SDK
  // is configured with a session token; ignored in local/analytics mode.
  clickToCancelEnabled?: boolean
  strictFTCComplianceEnabled?: boolean
  usedClickToCancel?: boolean
  autoOptimizationUsed?: boolean
  autoOptimizationKey?: string
  discountCooldown?: number
  pauseCooldown?: number
  discountCooldownApplied?: boolean
  pauseCooldownApplied?: boolean
}

export class ChurnkeyApi {
  private creds: SessionCredentials
  private baseUrl: string

  constructor(creds: SessionCredentials, baseUrl?: string) {
    this.creds = creds
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-ck-app': this.creds.appId,
      'x-ck-customer': this.creds.customerId,
      'x-ck-authorization': this.creds.authHash,
      'x-ck-mode': this.creds.mode,
    }
    if (this.creds.subscriptionId) {
      h['x-ck-subscription'] = this.creds.subscriptionId
    }
    return h
  }

  private orgUrl(path: string): string {
    return `${this.baseUrl}/api/orgs/${this.creds.appId}/${path}`
  }

  // Action methods discard the response body, so don't parse JSON here —
  // a server returning an empty 201 would otherwise blow up res.json() and
  // surface as an error even though the action committed.
  private async request(url: string, body?: unknown): Promise<Response> {
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Churnkey API error (${res.status}): ${text}`)
    }
    return res
  }

  async fetchConfig(): Promise<SdkConfig> {
    const res = await this.request(this.orgUrl('cancel-flow/config'))
    return (await res.json()) as SdkConfig
  }

  async applyDiscount(couponId: string, blueprintId?: string): Promise<void> {
    await this.request(this.orgUrl('cancel-flow/actions/discount'), {
      coupon: couponId,
      blueprintId,
    })
  }

  async pause(params: { duration: number; interval: string }): Promise<void> {
    await this.request(this.orgUrl('cancel-flow/actions/pause'), {
      duration: params.duration,
      interval: params.interval,
    })
  }

  async cancelSubscription(): Promise<void> {
    await this.request(this.orgUrl('cancel-flow/actions/cancel'), { cancelAtPeriodEnd: true })
  }

  async changePlan(planId: string): Promise<void> {
    await this.request(this.orgUrl('cancel-flow/actions/change-plan'), { planId })
  }

  async extendTrial(days: number, blueprintId?: string): Promise<void> {
    await this.request(this.orgUrl('cancel-flow/actions/extend-trial'), { days, blueprintId })
  }

  async createSession(payload: SessionPayload): Promise<void> {
    await this.request(`${this.baseUrl}/api/sessions/sdk`, payload)
  }
}

export class AnalyticsClient {
  private appId: string
  private baseUrl: string

  constructor(appId: string, baseUrl?: string) {
    this.appId = appId
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL
  }

  // Fire-and-forget. Non-2xx responses are ignored — analytics failures
  // should never surface into the host app's flow.
  async createSession(payload: SessionPayload): Promise<void> {
    await fetch(`${this.baseUrl}/api/sessions/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ck-app': this.appId,
      },
      body: JSON.stringify(payload),
    })
  }
}

function toIsoString(value: Date | string | undefined): string | undefined {
  if (value == null) return undefined
  return value instanceof Date ? value.toISOString() : String(value)
}

function toApiBillingInterval(interval: 'day' | 'week' | 'month' | 'year' | undefined): ApiBillingInterval | undefined {
  if (!interval) return undefined
  return interval.toUpperCase() as ApiBillingInterval
}

export function directDataToSessionCustomer(
  customer: DirectCustomer,
  subscriptions?: DirectSubscription[],
): SessionPayload['customer'] {
  const sub = subscriptions?.[0]
  const price = sub?.items[0]?.price

  return {
    id: customer.id,
    email: customer.email,
    subscriptionId: sub?.id,
    planId: price?.id,
    planPrice: price?.amount.value,
    currency: price?.amount.currency ?? customer.currency,
    billingInterval: toApiBillingInterval(price?.duration?.interval),
    created: toIsoString(sub?.start),
    onTrial: sub ? sub.status.name === 'trial' : undefined,
    customAttributes: customer.metadata,
  }
}
