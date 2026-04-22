import { createHmac } from 'node:crypto'
import type { ChurnkeyConfig, CreateTokenParams, Mode, TokenPayload } from './types'

export type { ChurnkeyConfig, CreateTokenParams, Mode, TokenPayload }

export const VERSION = '0.1.0'

export class Churnkey {
  private appId: string
  private apiKey: string

  constructor(config: ChurnkeyConfig) {
    if (!config.appId) throw new Error('appId is required')
    if (!config.apiKey) throw new Error('apiKey is required')
    this.appId = config.appId
    this.apiKey = config.apiKey
  }

  /**
   * Raw HMAC-SHA256 of the customer ID, keyed with the API key. This is the
   * `authHash` expected by the hosted embed widget (`churnkey.init({...})`).
   * For the React SDK, use `createToken()` instead.
   */
  authHash(customerId: string): string {
    if (!customerId) throw new Error('customerId is required')
    return createHmac('sha256', this.apiKey).update(customerId).digest('hex')
  }

  /** Create a session token for use with `<CancelFlow session={token} />`. */
  createToken(params: CreateTokenParams): string {
    if (!params.customerId) throw new Error('customerId is required')

    const payload: TokenPayload = {
      a: this.appId,
      c: params.customerId,
      h: this.authHash(params.customerId),
      m: params.mode ?? 'live',
      t: Date.now(),
    }

    if (params.subscriptionId) {
      payload.s = params.subscriptionId
    }

    const json = JSON.stringify(payload)
    const encoded = Buffer.from(json).toString('base64url')
    return `ck_${encoded}`
  }
}
