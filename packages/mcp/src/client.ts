import { NotAuthenticatedError, OAuthTokenProvider } from './auth/tokens'
import type { ChurnkeyAuth, ChurnkeyMcpConfig } from './config'

export interface RequestOptions {
  query?: Record<string, unknown>
  body?: unknown
}

export class ChurnkeyClient {
  private readonly tokenProvider: OAuthTokenProvider | null

  /**
   * The workspace the most recent API call acted on, captured from the
   * `X-Churnkey-Acting-Org-*` response headers. The server pins the org from the
   * token (never from client input), so this is the authoritative "which org did
   * I just touch". server.ts surfaces it in every tool result.
   */
  lastActingOrg?: { id: string; name?: string }

  constructor(
    private readonly config: ChurnkeyMcpConfig,
    tokenProvider?: OAuthTokenProvider,
  ) {
    this.tokenProvider = config.auth.kind === 'oauth' ? (tokenProvider ?? new OAuthTokenProvider()) : null
  }

  async get<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, options)
  }

  async post<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, options)
  }

  private async authHeaders(forceRefresh: boolean): Promise<Record<string, string>> {
    const auth = this.config.auth
    switch (auth.kind) {
      case 'data-api-key':
        return { 'x-ck-app': auth.appId, 'x-ck-api-key': auth.apiKey }
      case 'bearer':
        return this.withMode({ authorization: `Bearer ${auth.token}` })
      case 'oauth': {
        if (!this.tokenProvider) throw new NotAuthenticatedError()
        const token = await this.tokenProvider.getAccessToken(forceRefresh)
        return this.withMode({ authorization: `Bearer ${token}` })
      }
    }
  }

  private withMode(headers: Record<string, string>): Record<string, string> {
    if (this.config.mode === 'test') headers['x-ck-mode'] = 'test'
    return headers
  }

  private async request<T>(method: 'GET' | 'POST', path: string, options: RequestOptions): Promise<T> {
    const url = new URL(`${this.config.baseUrl}${path}`)
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined || value === null) continue
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, String(v))
        } else {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const performRequest = async (forceRefresh: boolean) => {
      const headers: Record<string, string> = {
        ...(await this.authHeaders(forceRefresh)),
        accept: 'application/json',
      }
      if (options.body !== undefined) {
        headers['content-type'] = 'application/json'
      }
      return fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      })
    }

    let res = await performRequest(false)
    // An expired/revoked access token comes back 401 — for managed OAuth, force
    // one refresh (rotating via the stored refresh token) and retry.
    if (res.status === 401 && this.config.auth.kind === 'oauth') {
      res = await performRequest(true)
    }

    // Capture the acting workspace the API echoes back (additive headers) so the
    // server can surface "which org did this act on" in every tool result.
    const actingOrgId = res.headers.get('x-churnkey-acting-org-id')
    if (actingOrgId) {
      const rawName = res.headers.get('x-churnkey-acting-org-name')
      this.lastActingOrg = { id: actingOrgId, name: rawName ? decodeURIComponent(rawName) : undefined }
    }

    const text = await res.text()
    const parsed = parseJson(text)

    if (!res.ok) {
      throw new Error(mapErrorMessage(res.status, parsed, this.config.auth.kind))
    }
    return parsed as T
  }
}

function parseJson(text: string): unknown {
  if (!text) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function unauthorizedHint(authKind: ChurnkeyAuth['kind']): string {
  if (authKind === 'data-api-key') {
    return 'Churnkey API rejected the credentials. Check CHURNKEY_APP_ID and CHURNKEY_API_KEY in your MCP server config — or switch to OAuth with `npx @churnkey/mcp auth login`.'
  }
  return 'Churnkey API rejected the OAuth session (expired or revoked). Run `npx @churnkey/mcp auth login` to sign in again.'
}

function mapErrorMessage(status: number, body: unknown, authKind: ChurnkeyAuth['kind']): string {
  const apiMessage = extractApiMessage(body)

  if (status === 401) {
    // The API distinguishes "bad credentials" from actionable states like
    // "this operation requires OAuth" — surface a descriptive server message,
    // but replace bare "Unauthorized"-style bodies with a useful hint.
    if (apiMessage && apiMessage.length >= 25) return apiMessage
    return unauthorizedHint(authKind)
  }
  if (status >= 500) {
    return apiMessage ?? `Churnkey API returned ${status}. Try again or check status.churnkey.co.`
  }
  // The Data API sends error bodies as plain text (res.send(error.message)), not JSON, so the
  // actionable validation/authorization message lives in the raw string body — surface it verbatim.
  if (apiMessage) {
    return apiMessage
  }
  if (status === 403) {
    return 'Churnkey API forbidden (403). Your user role or granted OAuth scopes may not allow this operation.'
  }
  if (status === 404) {
    return 'Churnkey API resource not found (404). Check the ID you passed (e.g. blueprint or segment ID).'
  }
  return `Churnkey API error ${status}`
}

// The success path returns JSON, but errors come back as a plain-text body. Accept either: an
// object with a `message` field, or a non-empty string body.
function extractApiMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message
    const text = message == null ? '' : String(message).trim()
    return text ? text : null
  }
  if (typeof body === 'string' && body.trim()) {
    return body.trim()
  }
  return null
}
