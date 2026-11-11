export interface ChurnkeyConfig {
  appId: string
  apiKey: string
  /** Base URL of the Churnkey API. Defaults to `https://api.churnkey.co`. */
  apiBase?: string
  /**
   * The mode the API key belongs to. Defaults to `'live'`. Pass `'test'` for a test-mode key,
   * or `'sandbox'` for a Stripe Sandbox key. Also the default `mode` for `createToken`.
   */
  mode?: Mode
}

export type Mode = 'live' | 'test' | 'sandbox'

export interface CreateTokenParams {
  customerId: string
  subscriptionId?: string
  /**
   * Defaults to the client's `mode`. Use 'test' to segregate staging sessions in analytics,
   * or 'sandbox' when the org is connected to a Stripe Sandbox (sandboxes have
   * their own account ID and credentials, unlike classic test mode).
   */
  mode?: Mode
}

export interface TokenPayload {
  /** App ID */
  a: string
  /** Customer ID */
  c: string
  /** Subscription ID */
  s?: string
  /** Auth hash (HMAC) */
  h: string
  /** Mode */
  m: Mode
  /** Issued at (epoch ms) */
  t: number
}

/** Flat key/value attributes attached to a tracked event. */
export type TrackProperties = Record<string, string | number | boolean | Date>

export interface TrackParams {
  /** Event name in Title Case "Object Action" form, e.g. `'Job Scheduled'`. */
  event: string
  /** The customer ID from your billing provider (e.g. Stripe `cus_...`). Required unless `uid` is set. */
  customerId?: string
  /** The customer's ID in your own system. Required unless `customerId` is set. */
  uid?: string
  /** The person acting inside the account, for B2B products with several users per customer. */
  userUid?: string
  /** Flat attributes of the event. Up to 256 keys and 10,000 characters of JSON. A Date is sent as an ISO string. */
  properties?: TrackProperties
  /** When the event happened. Defaults to the time the server receives it. Use for backfills. */
  timestamp?: Date
}
