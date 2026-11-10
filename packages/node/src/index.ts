import { createHmac } from 'node:crypto'
import type { ChurnkeyConfig, CreateTokenParams, Mode, TokenPayload, TrackParams, TrackProperties } from './types'

export type { ChurnkeyConfig, CreateTokenParams, Mode, TokenPayload, TrackParams, TrackProperties }

export const VERSION = '0.2.0'

const DEFAULT_API_BASE = 'https://api.churnkey.co'
const BULK_LIMIT = 100

/**
 * Thrown when the Churnkey API answers with a non-2xx status, or with `verified: false`, which
 * is how it reports an API key it does not accept (wrong key, revoked, or for another mode).
 */
export class ChurnkeyApiError extends Error {
  readonly status: number
  /** Response body, trimmed. Empty when the server sent none. */
  readonly body: string
  /**
   * How many events the API is known to have stored: every event in a request that succeeded
   * before this one, plus the events of a `verified: false` request, which the API stores
   * anyway. The failed request may also have stored its events (a 5xx can come after the
   * write), so this is a floor, and a retry from here can send some events twice.
   */
  readonly sent: number

  constructor(status: number, body: string, options: { message?: string; sent?: number } = {}) {
    super(options.message ?? `Churnkey API responded with ${status}${body ? `: ${body}` : ''}`)
    this.name = 'ChurnkeyApiError'
    this.status = status
    this.body = body
    this.sent = options.sent ?? 0
  }
}

interface EventBody {
  event: string
  customerId?: string
  uid?: string
  user?: { uid: string }
  eventData?: TrackProperties
  eventDate?: string
}

function toEventBody(params: TrackParams): EventBody {
  if (!params.event) throw new Error('event is required')
  if (!params.customerId && !params.uid) throw new Error('customerId or uid is required')

  const body: EventBody = { event: params.event }
  if (params.customerId) body.customerId = params.customerId
  if (params.uid) body.uid = params.uid
  if (params.userUid) body.user = { uid: params.userUid }
  if (params.properties) body.eventData = params.properties
  if (params.timestamp) body.eventDate = params.timestamp.toISOString()
  return body
}

export class Churnkey {
  private appId: string
  private apiKey: string
  private apiBase: string
  private mode: Mode

  constructor(config: ChurnkeyConfig) {
    if (!config.appId) throw new Error('appId is required')
    if (!config.apiKey) throw new Error('apiKey is required')
    this.appId = config.appId
    this.apiKey = config.apiKey
    this.apiBase = (config.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')
    this.mode = config.mode ?? 'live'
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
      m: params.mode ?? this.mode,
      t: Date.now(),
    }

    if (params.subscriptionId) {
      payload.s = params.subscriptionId
    }

    const json = JSON.stringify(payload)
    const encoded = Buffer.from(json).toString('base64url')
    return `ck_${encoded}`
  }

  /** Record a product usage event for a customer. Resolves once the API has accepted it. */
  async track(params: TrackParams): Promise<void> {
    await this.post('/v1/api/events/new', toEventBody(params), 0, 1)
  }

  /**
   * Record many events in one call, in requests of up to 100. Meant for
   * backfills; the bulk endpoint has to be enabled for your account. Requests go
   * in order, so when one fails the earlier ones are already stored: the error's
   * `sent` says how many, so a retry can skip them.
   */
  async trackBatch(events: TrackParams[]): Promise<void> {
    const bodies = events.map(toEventBody)
    for (let i = 0; i < bodies.length; i += BULK_LIMIT) {
      const chunk = bodies.slice(i, i + BULK_LIMIT)
      await this.post('/v1/api/events/bulk', chunk, i, chunk.length)
    }
  }

  /** `sent` is how many events earlier requests stored; `count` is how many this one carries. */
  private async post(path: string, body: unknown, sent: number, count: number): Promise<void> {
    const res = await fetch(`${this.apiBase}${path}`, {
      method: 'POST',
      headers: {
        'x-ck-api-key': this.apiKey,
        'x-ck-app': this.appId,
        'x-ck-mode': this.mode,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    // A 2xx has already stored the event, so a broken body stream must not turn it into a failure.
    const text = (await res.text().catch(() => '')).trim()
    if (!res.ok) {
      throw new ChurnkeyApiError(res.status, text, { sent })
    }
    // The API stores an event it could not verify but answers 200 with verified: false, so a
    // bad key would otherwise look like it works (and run on the unauthenticated rate limit).
    if (verifiedField(text) === false) {
      throw new ChurnkeyApiError(res.status, text, {
        sent: sent + count,
        message:
          'Churnkey stored the events but did not verify the request: check that appId and apiKey are correct and that mode matches the key',
      })
    }
  }
}

function verifiedField(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' ? (parsed as { verified?: unknown }).verified : undefined
  } catch {
    return undefined
  }
}
