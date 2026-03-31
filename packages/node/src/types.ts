export interface ChurnkeyConfig {
  appId: string
  apiKey: string
}

export interface CreateTokenParams {
  customerId: string
  subscriptionId?: string
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
  m: 'live' | 'test'
  /** Issued at (epoch ms) */
  t: number
}
