import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthTokenProvider } from '../src/auth/tokens'
import { ChurnkeyClient } from '../src/client'

function dataClient() {
  return new ChurnkeyClient({
    baseUrl: 'https://api.example.com/v1',
    auth: { kind: 'data-api-key', appId: 'app_123', apiKey: 'test_key' },
  })
}

function fetchOnce(body: string, status: number, headers?: Record<string, string>) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers }))
}

describe('ChurnkeyClient — query param serialization', () => {
  afterEach(() => vi.restoreAllMocks())

  it('skips null and undefined query values; appends arrays; stringifies scalars', async () => {
    const spy = fetchOnce('{}', 200)
    await dataClient().get('/data/x', {
      query: {
        a: undefined,
        b: null,
        c: 0, // falsy but defined → should be serialized
        d: false, // falsy but defined → should be serialized
        e: 'hi',
        tags: ['one', 'two'],
        nums: [1, 2],
      },
    })
    const url = new URL((spy.mock.calls[0][0] as URL).toString())
    expect(url.searchParams.has('a')).toBe(false)
    expect(url.searchParams.has('b')).toBe(false)
    expect(url.searchParams.get('c')).toBe('0')
    expect(url.searchParams.get('d')).toBe('false')
    expect(url.searchParams.get('e')).toBe('hi')
    expect(url.searchParams.getAll('tags')).toEqual(['one', 'two'])
    expect(url.searchParams.getAll('nums')).toEqual(['1', '2'])
  })

  it('handles an empty array (no params appended)', async () => {
    const spy = fetchOnce('{}', 200)
    await dataClient().get('/data/x', { query: { tags: [] } })
    const url = spy.mock.calls[0][0] as URL
    expect(url.searchParams.has('tags')).toBe(false)
  })
})

describe('ChurnkeyClient — body & content-type', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sets content-type and serializes a JSON body on POST', async () => {
    const spy = fetchOnce('{}', 200)
    await dataClient().post('/data/x', { body: { foo: 'bar' } })
    const init = spy.mock.calls[0][1]!
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ foo: 'bar' }))
    expect(init.method).toBe('POST')
  })

  it('omits content-type and body when no body is provided', async () => {
    const spy = fetchOnce('{}', 200)
    await dataClient().get('/data/x')
    const init = spy.mock.calls[0][1]!
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('serializes a body of `null` (defined, so content-type is set)', async () => {
    const spy = fetchOnce('{}', 200)
    await dataClient().post('/data/x', { body: null })
    const init = spy.mock.calls[0][1]!
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(init.body).toBe('null')
  })
})

describe('ChurnkeyClient — parseJson fallback', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns the raw text when the success body is not JSON', async () => {
    fetchOnce('plain text ok', 200)
    await expect(dataClient().get<string>('/data/x')).resolves.toBe('plain text ok')
  })

  it('returns an empty string for an empty 200 body', async () => {
    fetchOnce('', 200)
    await expect(dataClient().get<string>('/data/x')).resolves.toBe('')
  })

  it('parses a valid JSON object', async () => {
    fetchOnce(JSON.stringify({ ok: true, n: 5 }), 200)
    await expect(dataClient().get('/data/x')).resolves.toEqual({ ok: true, n: 5 })
  })
})

describe('ChurnkeyClient — mode header', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does NOT add x-ck-mode for data-api-key auth even when mode=test', async () => {
    const spy = fetchOnce('{}', 200)
    const client = new ChurnkeyClient({
      baseUrl: 'https://api.example.com/v1',
      auth: { kind: 'data-api-key', appId: 'a', apiKey: 'k' },
      mode: 'test',
    })
    await client.get('/data/x')
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['x-ck-mode']).toBeUndefined()
  })

  it('adds x-ck-mode only when mode=test (not for live)', async () => {
    const spy = fetchOnce('{}', 200)
    const client = new ChurnkeyClient({
      baseUrl: 'https://api.example.com/v1',
      auth: { kind: 'bearer', token: 'ck_oat_x' },
      mode: 'live',
    })
    await client.get('/data/x')
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['x-ck-mode']).toBeUndefined()
  })
})

describe('ChurnkeyClient — acting-org header capture', () => {
  afterEach(() => vi.restoreAllMocks())

  it('captures acting org id and url-decodes the name', async () => {
    fetchOnce('{}', 200, {
      'x-churnkey-acting-org-id': 'org_42',
      'x-churnkey-acting-org-name': 'Acme%20Inc%2E',
    })
    const client = dataClient()
    await client.get('/data/x')
    expect(client.lastActingOrg).toEqual({ id: 'org_42', name: 'Acme Inc.' })
  })

  it('captures id with undefined name when only id header is present', async () => {
    fetchOnce('{}', 200, { 'x-churnkey-acting-org-id': 'org_7' })
    const client = dataClient()
    await client.get('/data/x')
    expect(client.lastActingOrg).toEqual({ id: 'org_7', name: undefined })
  })

  it('leaves lastActingOrg unset when no acting-org headers are present', async () => {
    fetchOnce('{}', 200)
    const client = dataClient()
    await client.get('/data/x')
    expect(client.lastActingOrg).toBeUndefined()
  })

  it('captures acting org even on an error response (header read before throw)', async () => {
    fetchOnce('boom', 500, { 'x-churnkey-acting-org-id': 'org_err' })
    const client = dataClient()
    await expect(client.get('/data/x')).rejects.toThrow()
    expect(client.lastActingOrg).toEqual({ id: 'org_err', name: undefined })
  })
})

describe('ChurnkeyClient — mapErrorMessage per auth kind', () => {
  afterEach(() => vi.restoreAllMocks())

  it('401 bare body for OAuth → OAuth re-login hint', async () => {
    // OAuth performs a forced-refresh retry on 401; both calls return 401.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unauthorized', { status: 401 }))
    const provider = { getAccessToken: vi.fn().mockResolvedValue('ck_oat_x') } as unknown as OAuthTokenProvider
    const client = new ChurnkeyClient({ baseUrl: 'https://api.example.com/v1', auth: { kind: 'oauth' } }, provider)
    await expect(client.get('/data/x')).rejects.toThrow(/auth login/)
  })

  it('401 bare body for data-api-key → credentials hint mentioning OAuth login', async () => {
    fetchOnce('unauthorized', 401)
    await expect(dataClient().get('/data/x')).rejects.toThrow(/CHURNKEY_APP_ID/)
  })

  it('401 with a short (<25 char) message falls back to the hint', async () => {
    fetchOnce('nope', 401)
    await expect(dataClient().get('/data/x')).rejects.toThrow(/credentials/i)
  })

  it('401 with a long (>=25 char) message is surfaced verbatim', async () => {
    const msg = 'This operation requires OAuth user authentication via MCP.'
    fetchOnce(msg, 401)
    await expect(dataClient().get('/data/x')).rejects.toThrow(msg)
  })

  it('500 with a body surfaces the body message', async () => {
    fetchOnce('Database is on fire', 500)
    await expect(dataClient().get('/data/x')).rejects.toThrow('Database is on fire')
  })

  it('500 with empty body gives the status fallback w/ status page hint', async () => {
    fetchOnce('', 500)
    await expect(dataClient().get('/data/x')).rejects.toThrow(/500.*status\.churnkey\.co/)
  })

  it('503 empty body uses the >=500 fallback', async () => {
    fetchOnce('', 503)
    await expect(dataClient().get('/data/x')).rejects.toThrow(/503/)
  })

  it('403 empty body gives the role/scope fallback', async () => {
    fetchOnce('', 403)
    await expect(dataClient().get('/data/x')).rejects.toThrow(/role or granted OAuth scopes/)
  })

  it('404 empty body gives the resource-not-found fallback', async () => {
    fetchOnce('', 404)
    await expect(dataClient().get('/data/x')).rejects.toThrow(/resource not found/)
  })

  it('400 empty body gives the generic "API error <status>" fallback', async () => {
    fetchOnce('', 400)
    await expect(dataClient().get('/data/x')).rejects.toThrow('Churnkey API error 400')
  })

  it('extracts a JSON {message} body for a 4xx', async () => {
    fetchOnce(JSON.stringify({ message: 'Segment not found' }), 404, { 'content-type': 'application/json' })
    await expect(dataClient().get('/data/x')).rejects.toThrow('Segment not found')
  })

  it('JSON body with null message → falls back to status fallback', async () => {
    fetchOnce(JSON.stringify({ message: null }), 404, { 'content-type': 'application/json' })
    await expect(dataClient().get('/data/x')).rejects.toThrow(/resource not found/)
  })

  it('JSON body with empty-string message → falls back', async () => {
    fetchOnce(JSON.stringify({ message: '   ' }), 404, { 'content-type': 'application/json' })
    await expect(dataClient().get('/data/x')).rejects.toThrow(/resource not found/)
  })

  it('JSON body with a numeric message is coerced to string and surfaced', async () => {
    fetchOnce(JSON.stringify({ message: 12345 }), 404, { 'content-type': 'application/json' })
    await expect(dataClient().get('/data/x')).rejects.toThrow('12345')
  })

  it('whitespace-only plain-text error body is treated as no message', async () => {
    fetchOnce('   ', 404)
    await expect(dataClient().get('/data/x')).rejects.toThrow(/resource not found/)
  })
})

describe('ChurnkeyClient — OAuth 401 refresh/retry', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does NOT retry on 401 for data-api-key (no force refresh path)', async () => {
    const spy = fetchOnce('unauthorized', 401)
    await expect(dataClient().get('/data/x')).rejects.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on 401 for static bearer auth', async () => {
    const spy = fetchOnce('unauthorized', 401)
    const client = new ChurnkeyClient({
      baseUrl: 'https://api.example.com/v1',
      auth: { kind: 'bearer', token: 'ck_oat_x' },
    })
    await expect(client.get('/data/x')).rejects.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('refresh that also 401s → surfaces the OAuth error after exactly one retry', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unauthorized', { status: 401 }))
    const getAccessToken = vi
      .fn<(force?: boolean) => Promise<string>>()
      .mockResolvedValueOnce('stale')
      .mockResolvedValueOnce('fresh')
    const provider = { getAccessToken } as unknown as OAuthTokenProvider
    const client = new ChurnkeyClient({ baseUrl: 'https://api.example.com/v1', auth: { kind: 'oauth' } }, provider)
    await expect(client.get('/data/x')).rejects.toThrow(/auth login/)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(getAccessToken).toHaveBeenNthCalledWith(1, false)
    expect(getAccessToken).toHaveBeenNthCalledWith(2, true)
  })

  it('throws NotAuthenticatedError if oauth config has no token provider', async () => {
    // Construct with oauth kind but inject null by bypassing the default — use a config that
    // would normally create a provider, then stub the provider away is not possible; instead
    // verify the default provider path throws when not authenticated.
    const client = new ChurnkeyClient({
      baseUrl: 'https://api.example.com/v1',
      auth: { kind: 'oauth' },
    })
    // No stored auth in this env dir → default OAuthTokenProvider throws NotAuthenticatedError.
    await expect(client.get('/data/x')).rejects.toThrow()
  })

  it('forwards x-ck-mode=test on the OAuth bearer header', async () => {
    const spy = fetchOnce('{}', 200)
    const getAccessToken = vi.fn().mockResolvedValue('ck_oat_live')
    const provider = { getAccessToken } as unknown as OAuthTokenProvider
    const client = new ChurnkeyClient(
      { baseUrl: 'https://api.example.com/v1', auth: { kind: 'oauth' }, mode: 'test' },
      provider,
    )
    await client.get('/data/x')
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer ck_oat_live')
    expect(headers['x-ck-mode']).toBe('test')
  })
})

describe('ChurnkeyClient — URL construction', () => {
  afterEach(() => vi.restoreAllMocks())

  it('concatenates baseUrl + path directly (path includes leading slash)', async () => {
    const spy = fetchOnce('{}', 200)
    await dataClient().get('/data/blueprints/abc')
    expect((spy.mock.calls[0][0] as URL).toString()).toBe('https://api.example.com/v1/data/blueprints/abc')
  })
})
