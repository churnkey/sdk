import { createHmac } from 'node:crypto'
import type { ChurnkeyConfig, CreateTokenParams, TokenPayload } from './types'

export type { ChurnkeyConfig, CreateTokenParams, TokenPayload }

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

  /** Create a session token for use with `<CancelFlow session={token} />`. */
  createToken(params: CreateTokenParams): string {
    if (!params.customerId) throw new Error('customerId is required')

    const authHash = createHmac('sha256', this.apiKey).update(params.customerId).digest('hex')

    const payload: TokenPayload = {
      a: this.appId,
      c: params.customerId,
      h: authHash,
      m: 'live',
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
