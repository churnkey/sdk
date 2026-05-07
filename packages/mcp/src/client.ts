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
  const apiMessage =
    body && typeof body === 'object' && 'message' in body ? String((body as { message: unknown }).message) : null

  if (status === 401) {
    return 'Churnkey API rejected the credentials. Check CHURNKEY_APP_ID and CHURNKEY_API_KEY in your MCP server config.'
  }
  if (status >= 500) {
    return apiMessage ?? `Churnkey API returned ${status}. Try again or check status.churnkey.co.`
  }
  return apiMessage ?? `Churnkey API error ${status}`
}
