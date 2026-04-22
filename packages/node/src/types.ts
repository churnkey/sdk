export interface ChurnkeyConfig {
  appId: string
  apiKey: string
}

export type Mode = 'live' | 'test'

export interface CreateTokenParams {
  customerId: string
  subscriptionId?: string
  /** Defaults to 'live'. Use 'test' to segregate staging sessions in analytics. */
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
