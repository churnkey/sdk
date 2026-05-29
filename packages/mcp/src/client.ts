import type { ChurnkeyMcpConfig } from './config'

export interface RequestOptions {
  query?: Record<string, unknown>
  body?: unknown
}

export class ChurnkeyClient {
  constructor(private readonly config: ChurnkeyMcpConfig) {}

  async get<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, options)
  }

  async post<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, options)
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

    const headers: Record<string, string> = {
      'x-ck-app': this.config.appId,
      'x-ck-api-key': this.config.apiKey,
      accept: 'application/json',
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json'
    }

    const res = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })

    const text = await res.text()
    const parsed = parseJson(text)

    if (!res.ok) {
      throw new Error(mapErrorMessage(res.status, parsed))
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

function mapErrorMessage(status: number, body: unknown): string {
  const apiMessage = extractApiMessage(body)

  if (status === 401) {
    return 'Churnkey API rejected the credentials. Check CHURNKEY_APP_ID and CHURNKEY_API_KEY in your MCP server config.'
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
    return 'Churnkey API forbidden (403). Your account may not have this capability enabled — check the API key and account permissions.'
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
