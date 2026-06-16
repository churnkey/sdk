import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthTokenProvider } from '../src/auth/tokens'
import { ChurnkeyClient } from '../src/client'

function makeClient() {
  return new ChurnkeyClient({
    baseUrl: 'https://api.example.com/v1',
    auth: { kind: 'data-api-key', appId: 'app_123', apiKey: 'test_key' },
  })
}

function mockFetch(body: string, status: number, headers?: Record<string, string>) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers }))
}

describe('ChurnkeyClient error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('surfaces a plain-text error body from the Data API (404)', async () => {
    mockFetch('Blueprint step not found.', 404)
    await expect(makeClient().get('/data/blueprints/x/step')).rejects.toThrow('Blueprint step not found.')
  })

  it('surfaces a 422 validation message verbatim', async () => {
    mockFetch('Disallowed step update fields: foo', 422)
    await expect(makeClient().post('/data/blueprints/x/step', { body: {} })).rejects.toThrow(
      'Disallowed step update fields: foo',
    )
  })

  it('surfaces a 403 disabled-account message verbatim', async () => {
    mockFetch('DSR access is disabled for this account. Please contact support@churnkey.co for assistance.', 403)
    await expect(makeClient().post('/data/dsr/access', { body: {} })).rejects.toThrow(/disabled for this account/)
  })

  it('still reads a JSON { message } error body', async () => {
    mockFetch(JSON.stringify({ message: 'Working copy not found.' }), 404, { 'content-type': 'application/json' })
    await expect(makeClient().get('/data/blueprints/x')).rejects.toThrow('Working copy not found.')
  })

  it('keeps the credential hint for a bare 401 body', async () => {
    mockFetch('unauthorized', 401)
    await expect(makeClient().get('/data/blueprints')).rejects.toThrow(/credentials/i)
  })

  it('surfaces a descriptive 401 server message verbatim (e.g. OAuth-required writes)', async () => {
    mockFetch(
      'This operation requires user authentication via OAuth (MCP). Data API keys are limited to read endpoints.',
      401,
    )
    await expect(makeClient().post('/data/blueprints/x/publish', { body: {} })).rejects.toThrow(
      /requires user authentication via OAuth/,
    )
  })

  it('gives a typed fallback for an empty 403 body', async () => {
    mockFetch('', 403)
    await expect(makeClient().get('/data/blueprints')).rejects.toThrow(/403/)
  })
})

describe('ChurnkeyClient auth headers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends Data API key headers for data-api-key auth', async () => {
    const spy = mockFetch('{}', 200)
    await makeClient().get('/data/blueprints')
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['x-ck-app']).toBe('app_123')
    expect(headers['x-ck-api-key']).toBe('test_key')
    expect(headers.authorization).toBeUndefined()
  })

  it('sends a Bearer header (+ x-ck-mode) for static bearer auth', async () => {
    const spy = mockFetch('{}', 200)
    const client = new ChurnkeyClient({
      baseUrl: 'https://api.example.com/v1',
      auth: { kind: 'bearer', token: 'ck_oat_abc' },
      mode: 'test',
    })
    await client.get('/data/blueprints')
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer ck_oat_abc')
    expect(headers['x-ck-mode']).toBe('test')
  })

  it('refreshes once and retries when an OAuth access token gets a 401', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Invalid or expired access token', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    const getAccessToken = vi
      .fn<(force?: boolean) => Promise<string>>()
      .mockResolvedValueOnce('ck_oat_stale')
      .mockResolvedValueOnce('ck_oat_fresh')
    const provider = { getAccessToken } as unknown as OAuthTokenProvider

    const client = new ChurnkeyClient({ baseUrl: 'https://api.example.com/v1', auth: { kind: 'oauth' } }, provider)
    const result = await client.get<{ ok: boolean }>('/data/blueprints')

    expect(result.ok).toBe(true)
    expect(getAccessToken).toHaveBeenNthCalledWith(1, false)
    expect(getAccessToken).toHaveBeenNthCalledWith(2, true)
    const retryHeaders = spy.mock.calls[1][1]?.headers as Record<string, string>
    expect(retryHeaders.authorization).toBe('Bearer ck_oat_fresh')
  })
})
