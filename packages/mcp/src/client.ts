import type { ChurnkeyMcpConfig } from './config'

export class ChurnkeyApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = 'ChurnkeyApiError'
    this.status = status
    this.body = body
  }
}

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
    let parsed: unknown = text
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        // leave as text
      }
    }

    if (!res.ok) {
      throw new ChurnkeyApiError(res.status, mapErrorMessage(res.status, parsed), parsed)
    }

    if (parsed && typeof parsed === 'object' && 'data' in (parsed as Record<string, unknown>)) {
      return (parsed as { data: T }).data
    }
    return parsed as T
  }
}

function mapErrorMessage(status: number, body: unknown): string {
  const apiMessage =
    body && typeof body === 'object' && 'message' in (body as Record<string, unknown>)
      ? String((body as Record<string, unknown>).message)
      : null

  if (status === 401) {
    return 'Churnkey API rejected the credentials. Check CHURNKEY_APP_ID and CHURNKEY_API_KEY in your MCP server config.'
  }
  if (status === 403) {
    return apiMessage ?? 'Churnkey API forbids this action for the supplied API key.'
  }
  if (status === 404) {
    return apiMessage ?? 'Resource not found.'
  }
  if (status === 422) {
    return apiMessage ?? 'Invalid request parameters.'
  }
  if (status >= 500) {
    return apiMessage ?? `Churnkey API returned ${status}. Try again or check status.churnkey.co.`
  }
  return apiMessage ?? `Churnkey API error ${status}`
}
