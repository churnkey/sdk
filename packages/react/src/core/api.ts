import type { EmbedResponse } from './api-types'
import type { SessionCredentials } from './token'
import type { DirectCustomer, DirectSubscription } from './types'

const DEFAULT_BASE_URL = 'https://api.churnkey.co/v1'

export interface SessionPayload {
  blueprintId?: string
  customer?: {
    id: string
    email?: string
    subscriptionId?: string
    planId?: string
    planPrice?: number
    currency?: string
    billingInterval?: string
    created?: string
    onTrial?: boolean
    customAttributes?: Record<string, unknown>
  }
  canceled?: boolean
  surveyChoiceId?: string
  surveyChoiceValue?: string
  feedback?: string
  acceptedOffer?: {
    guid?: string
    offerType: string
    couponId?: string
    couponType?: string
    couponAmount?: number
    couponDuration?: number
    pauseDuration?: number
    pauseInterval?: string
    newPlanId?: string
    newPlanPrice?: number
    trialExtensionDays?: number
    redirectUrl?: string
  }
  presentedOffers?: Array<{ guid?: string }>
  stepsViewed?: Array<{
    stepType?: string
    start?: string
    end?: string
    duration?: number
  }>
  mode: 'LIVE' | 'TEST'
  provider?: string
  embedVersion?: string
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

  private async request(url: string, body?: unknown): Promise<unknown> {
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Churnkey API error (${res.status}): ${text}`)
    }
    return res.json()
  }

  async fetchConfig(): Promise<EmbedResponse> {
    const data = await this.request(this.orgUrl('embed'))
    return data as EmbedResponse
  }

  async applyDiscount(couponId: string, blueprintId?: string): Promise<void> {
    await this.request(this.orgUrl('apply-discount'), {
      coupon: couponId,
      blueprintId,
    })
  }

  async pause(params: { duration: number; interval: string }): Promise<void> {
    await this.request(this.orgUrl('pause'), {
      duration: params.duration,
      interval: params.interval,
    })
  }

  async cancelSubscription(): Promise<void> {
    await this.request(this.orgUrl('cancel'), {})
  }

  async changePlan(planId: string): Promise<void> {
    await this.request(this.orgUrl('change-price'), {
      planId,
    })
  }

  async extendTrial(days: number): Promise<void> {
    await this.request(this.orgUrl('extend-trial'), {
      days,
    })
  }

  async createSession(payload: SessionPayload): Promise<void> {
    await this.request(`${this.baseUrl}/api/sessions`, payload)
  }
}

export class AnalyticsClient {
  private appId: string
  private baseUrl: string

  constructor(appId: string, baseUrl?: string) {
    this.appId = appId
    this.baseUrl = baseUrl ?? DEFAULT_BASE_URL
  }

  async createSession(payload: SessionPayload): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/sessions/sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ck-app': this.appId,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return // analytics failures are silent
  }
}

export function directDataToSessionCustomer(
  customer: DirectCustomer,
  subscriptions?: DirectSubscription[],
): SessionPayload['customer'] {
  const sub = subscriptions?.[0]
  const item = sub?.items[0]
  const price = item?.price

  return {
    id: customer.id,
    email: customer.email,
    subscriptionId: sub?.id,
    planId: price?.id,
    planPrice: price?.amount.value,
    currency: price?.amount.currency ?? customer.currency ?? 'usd',
    billingInterval: price?.interval?.toUpperCase(),
    created: sub?.start != null ? String(sub.start instanceof Date ? sub.start.toISOString() : sub.start) : undefined,
    onTrial: sub?.status.name === 'trial',
    customAttributes: customer.metadata,
  }
}
