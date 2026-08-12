import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BASELINE_SCOPES,
  buildAuthorizeUrl,
  exchangeCode,
  generatePkce,
  OAUTH_CLIENT_ID,
  OAuthRequestError,
  refreshTokens,
  revokeToken,
  SUPPORTED_SCOPES,
} from '../src/auth/oauth'
import { authFilePath, clearStoredAuth, loadStoredAuth, type StoredAuth, saveStoredAuth } from '../src/auth/storage'
import { NotAuthenticatedError, OAuthTokenProvider, storedAuthFromTokenResponse } from '../src/auth/tokens'

const tempDirs: string[] = []
function tempEnv(): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), 'ck-mcp-auth-adv-'))
  tempDirs.push(dir)
  return { CHURNKEY_CONFIG_DIR: dir }
}
function storedAuth(overrides: Partial<StoredAuth> = {}): StoredAuth {
  return {
    baseUrl: 'https://api.example.com/v1',
    accessToken: 'ck_oat_current',
    accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    refreshToken: 'ck_ort_current',
    scopes: ['cancel_flows.blueprints.read'],
    ...overrides,
  }
}
function tokenResponseBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    access_token: 'ck_oat_new',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'ck_ort_new',
    scope: 'a b',
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true })
})

describe('oauth — buildAuthorizeUrl', () => {
  it('encodes redirect_uri and joins scopes with spaces', () => {
    const url = new URL(
      buildAuthorizeUrl({
        baseUrl: 'https://api.example.com/v1',
        redirectUri: 'http://127.0.0.1:5000/callback',
        scopes: ['x.read', 'y.write'],
        state: 'st',
        codeChallenge: 'chal',
      }),
    )
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5000/callback')
    expect(url.searchParams.get('scope')).toBe('x.read y.write')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('client_id')).toBe(OAUTH_CLIENT_ID)
  })
})

describe('oauth — SUPPORTED_SCOPES', () => {
  it('is the documented catalog', () => {
    expect(SUPPORTED_SCOPES).toContain('cancel_flows.blueprints.write')
    expect(SUPPORTED_SCOPES).toContain('dsr.read')
    expect(SUPPORTED_SCOPES.length).toBeGreaterThan(20)
  })

  it('does not request erasure authority it ships no tool for', () => {
    expect(SUPPORTED_SCOPES).not.toContain('dsr.write')
  })
})

// This set is what a remote user is asked to approve before they have read
// anything, so widening it by accident is a consent-screen regression rather
// than a test failure anyone would notice.
describe('oauth — BASELINE_SCOPES', () => {
  it('withholds every scope that exposes customer personal data', () => {
    for (const scope of BASELINE_SCOPES) {
      expect(scope, `${scope} exposes personal data`).not.toMatch(/read_pii$/)
    }
    expect(SUPPORTED_SCOPES.filter((s) => s.endsWith('read_pii')).length).toBeGreaterThan(0)
  })

  // Anything else withheld would delete tools outright: those scopes gate routes,
  // and nothing can widen a grant after the fact. Until an escalation path
  // exists, holding a route-gating scope back is a functional regression rather
  // than a security improvement.
  it('withholds nothing that gates a route', () => {
    const missing = SUPPORTED_SCOPES.filter((s) => !BASELINE_SCOPES.includes(s))
    expect(missing.every((s) => s.endsWith('read_pii'))).toBe(true)
  })

  it('stays a subset of the catalog, so every baseline scope is grantable', () => {
    for (const scope of BASELINE_SCOPES) expect(SUPPORTED_SCOPES).toContain(scope)
  })

  // Empty is the one value that breaks login outright: clients would send no
  // scope at all and the authorization server rejects that.
  it('is non-empty and narrower than the catalog', () => {
    expect(BASELINE_SCOPES.length).toBeGreaterThan(0)
    expect(BASELINE_SCOPES.length).toBeLessThan(SUPPORTED_SCOPES.length)
  })
})

describe('oauth — generatePkce', () => {
  it('produces distinct, url-safe verifier/challenge with S256-length challenge', () => {
    const { verifier, challenge } = generatePkce()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(verifier).not.toBe(challenge)
    // sha256 base64url is 43 chars
    expect(challenge.length).toBe(43)
  })
})

describe('oauth — token endpoint requests', () => {
  it('exchangeCode posts authorization_code grant with client_id + verifier', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(tokenResponseBody(), { status: 200 }))
    const res = await exchangeCode({
      baseUrl: 'https://api.example.com/v1',
      code: 'the_code',
      codeVerifier: 'the_verifier',
      redirectUri: 'http://127.0.0.1:9/callback',
    })
    expect(res.access_token).toBe('ck_oat_new')
    const init = spy.mock.calls[0][1]!
    expect(spy.mock.calls[0][0] as string).toBe('https://api.example.com/v1/oauth/token')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      client_id: OAUTH_CLIENT_ID,
      grant_type: 'authorization_code',
      code: 'the_code',
      code_verifier: 'the_verifier',
      redirect_uri: 'http://127.0.0.1:9/callback',
    })
  })

  it('refreshTokens posts refresh_token grant', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(tokenResponseBody(), { status: 200 }))
    await refreshTokens({ baseUrl: 'https://api.example.com/v1', refreshToken: 'rt_123' })
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string)
    expect(body).toMatchObject({ client_id: OAUTH_CLIENT_ID, grant_type: 'refresh_token', refresh_token: 'rt_123' })
  })

  it('throws OAuthRequestError with error_description from a JSON error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Grant revoked' }), { status: 400 }),
    )
    await expect(refreshTokens({ baseUrl: 'https://api.example.com/v1', refreshToken: 'rt' })).rejects.toMatchObject({
      name: 'OAuthRequestError',
      status: 400,
      message: 'Grant revoked',
    })
  })

  it('falls back to raw text when error body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('upstream exploded', { status: 502 }))
    await expect(refreshTokens({ baseUrl: 'https://api.example.com/v1', refreshToken: 'rt' })).rejects.toThrow(
      'upstream exploded',
    )
  })

  it('falls back to "HTTP <status>" when error body is empty and not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(refreshTokens({ baseUrl: 'https://api.example.com/v1', refreshToken: 'rt' })).rejects.toThrow(
      'HTTP 503',
    )
  })

  it('OAuthRequestError carries the status code', () => {
    const err = new OAuthRequestError('boom', 418)
    expect(err.status).toBe(418)
    expect(err.name).toBe('OAuthRequestError')
    expect(err instanceof Error).toBe(true)
  })

  it('revokeToken posts client_id + token and swallows network/HTTP outcome', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    await expect(revokeToken({ baseUrl: 'https://api.example.com/v1', token: 'tok' })).resolves.toBeUndefined()
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string)
    expect(body).toEqual({ client_id: OAUTH_CLIENT_ID, token: 'tok' })
    expect(spy.mock.calls[0][0] as string).toBe('https://api.example.com/v1/oauth/revoke')
  })
})

describe('tokens — storedAuthFromTokenResponse', () => {
  it('handles an empty scope string → empty array', () => {
    const stored = storedAuthFromTokenResponse('https://b/v1', {
      access_token: 'a',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'r',
      scope: '',
    })
    expect(stored.scopes).toEqual([])
  })

  it('sets expiry expires_in seconds in the future', () => {
    const before = Date.now()
    const stored = storedAuthFromTokenResponse('https://b/v1', {
      access_token: 'a',
      token_type: 'Bearer',
      expires_in: 100,
      refresh_token: 'r',
      scope: 'x',
    })
    const exp = Date.parse(stored.accessTokenExpiresAt)
    expect(exp).toBeGreaterThanOrEqual(before + 99_000)
    expect(exp).toBeLessThanOrEqual(Date.now() + 101_000)
  })
})

describe('OAuthTokenProvider — expiry/skew/concurrency', () => {
  it('throws NotAuthenticatedError when no stored auth', async () => {
    const provider = new OAuthTokenProvider(tempEnv())
    await expect(provider.getAccessToken()).rejects.toThrow(NotAuthenticatedError)
  })

  it('refreshes when within the 60s expiry skew window even if not strictly expired', async () => {
    const env = tempEnv()
    // expires 30s from now — inside the 60s skew → must refresh
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: new Date(Date.now() + 30_000).toISOString() }), env)
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(tokenResponseBody(), { status: 200 }))
    const provider = new OAuthTokenProvider(env)
    await expect(provider.getAccessToken()).resolves.toBe('ck_oat_new')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does NOT refresh when comfortably fresh (beyond skew)', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: new Date(Date.now() + 120_000).toISOString() }), env)
    const spy = vi.spyOn(globalThis, 'fetch')
    const provider = new OAuthTokenProvider(env)
    await expect(provider.getAccessToken()).resolves.toBe('ck_oat_current')
    expect(spy).not.toHaveBeenCalled()
  })

  it('forceRefresh refreshes even when the token is fresh', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: new Date(Date.now() + 120_000).toISOString() }), env)
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(tokenResponseBody(), { status: 200 }))
    const provider = new OAuthTokenProvider(env)
    await expect(provider.getAccessToken(true)).resolves.toBe('ck_oat_new')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent refreshes to a single token request (no double-rotate)', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() }), env)
    let resolveFetch: (r: Response) => void = () => {}
    const fetchPromise = new Promise<Response>((r) => {
      resolveFetch = r
    })
    const spy = vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise as Promise<Response>)
    const provider = new OAuthTokenProvider(env)
    const p1 = provider.getAccessToken()
    const p2 = provider.getAccessToken()
    resolveFetch(new Response(tokenResponseBody(), { status: 200 }))
    const [a, b] = await Promise.all([p1, p2])
    expect(a).toBe('ck_oat_new')
    expect(b).toBe('ck_oat_new')
    expect(spy).toHaveBeenCalledTimes(1) // single in-flight refresh shared
  })

  it('treats a missing/blank accessTokenExpiresAt as expired (Date.parse NaN → 0)', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: '' }), env)
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(tokenResponseBody(), { status: 200 }))
    const provider = new OAuthTokenProvider(env)
    await expect(provider.getAccessToken()).resolves.toBe('ck_oat_new')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('persists rotation: the new refresh token is written back to disk', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() }), env)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(tokenResponseBody({ refresh_token: 'ck_ort_rotated' }), { status: 200 }),
    )
    await new OAuthTokenProvider(env).getAccessToken()
    const onDisk = JSON.parse(readFileSync(authFilePath(env), 'utf8'))
    expect(onDisk.refreshToken).toBe('ck_ort_rotated')
    expect(onDisk.accessToken).toBe('ck_oat_new')
  })

  it('clears the in-flight latch after a failed refresh so a later call can retry', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() }), env)
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{"error":"x"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(tokenResponseBody(), { status: 200 }))
    const provider = new OAuthTokenProvider(env)
    await expect(provider.getAccessToken()).rejects.toThrow(NotAuthenticatedError)
    // latch cleared → second attempt issues a fresh fetch and succeeds
    await expect(provider.getAccessToken()).resolves.toBe('ck_oat_new')
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('storage — edge cases', () => {
  it('chmods an existing file back to 600 on overwrite', () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth(), env)
    // overwrite (file already exists path → chmodSync branch)
    saveStoredAuth(storedAuth({ accessToken: 'ck_oat_v2' }), env)
    expect(statSync(authFilePath(env)).mode & 0o777).toBe(0o600)
    expect(loadStoredAuth(env)!.accessToken).toBe('ck_oat_v2')
  })

  it('loadStoredAuth returns null when refreshToken is missing', () => {
    const env = tempEnv()
    writeFileSync(authFilePath(env), JSON.stringify({ baseUrl: 'https://b/v1', accessToken: 'a' }))
    expect(loadStoredAuth(env)).toBeNull()
  })

  it('loadStoredAuth returns null when baseUrl is missing', () => {
    const env = tempEnv()
    writeFileSync(authFilePath(env), JSON.stringify({ refreshToken: 'r', accessToken: 'a' }))
    expect(loadStoredAuth(env)).toBeNull()
  })

  it('loadStoredAuth returns null on malformed JSON', () => {
    const env = tempEnv()
    writeFileSync(authFilePath(env), '{not json')
    expect(loadStoredAuth(env)).toBeNull()
  })

  it('clearStoredAuth returns false when nothing is stored', () => {
    expect(clearStoredAuth(tempEnv())).toBe(false)
  })

  it('authFilePath defaults under ~/.churnkey when CHURNKEY_CONFIG_DIR unset', () => {
    const p = authFilePath({})
    expect(p.endsWith('/.churnkey/mcp-auth.json')).toBe(true)
  })
})
