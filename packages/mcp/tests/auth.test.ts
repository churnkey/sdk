import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAuthorizeUrl, generatePkce } from '../src/auth/oauth'
import { authFilePath, clearStoredAuth, loadStoredAuth, type StoredAuth, saveStoredAuth } from '../src/auth/storage'
import { OAuthTokenProvider, storedAuthFromTokenResponse } from '../src/auth/tokens'

const tempDirs: string[] = []
function tempEnv(): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), 'ck-mcp-auth-'))
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

afterEach(() => {
  vi.restoreAllMocks()
  while (tempDirs.length) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

describe('PKCE', () => {
  it('generates an S256 challenge pair and a spec-compliant authorize URL', () => {
    const { verifier, challenge } = generatePkce()
    expect(verifier).not.toBe(challenge)
    expect(verifier.length).toBeGreaterThanOrEqual(43)

    const url = new URL(
      buildAuthorizeUrl({
        baseUrl: 'https://api.example.com/v1',
        redirectUri: 'http://127.0.0.1:4242/callback',
        scopes: ['a.b.read', 'a.b.write'],
        state: 'state123',
        codeChallenge: challenge,
      }),
    )
    expect(url.pathname).toBe('/v1/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('churnkey-mcp')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('a.b.read a.b.write')
    expect(url.searchParams.get('code_challenge')).toBe(challenge)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
})

describe('token storage', () => {
  it('round-trips stored auth with restrictive file permissions', () => {
    const env = tempEnv()
    const auth = storedAuth()
    saveStoredAuth(auth, env)

    expect(loadStoredAuth(env)).toEqual(auth)
    const mode = statSync(authFilePath(env)).mode & 0o777
    expect(mode).toBe(0o600)

    expect(clearStoredAuth(env)).toBe(true)
    expect(loadStoredAuth(env)).toBeNull()
  })

  it('returns null for a corrupted token file', () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth(), env)
    const path = authFilePath(env)
    rmSync(path)
    expect(loadStoredAuth(env)).toBeNull()
  })
})

describe('OAuthTokenProvider', () => {
  it('returns the cached access token while fresh', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth(), env)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const provider = new OAuthTokenProvider(env)
    await expect(provider.getAccessToken()).resolves.toBe('ck_oat_current')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refreshes (and rotates the stored refresh token) when expired', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() }), env)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'ck_oat_new',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'ck_ort_new',
          scope: 'cancel_flows.blueprints.read',
        }),
        { status: 200 },
      ),
    )

    const provider = new OAuthTokenProvider(env)
    await expect(provider.getAccessToken()).resolves.toBe('ck_oat_new')

    const stored = JSON.parse(readFileSync(authFilePath(env), 'utf8'))
    expect(stored.accessToken).toBe('ck_oat_new')
    expect(stored.refreshToken).toBe('ck_ort_new')
  })

  it('maps a failed refresh to a sign-in-again error', async () => {
    const env = tempEnv()
    saveStoredAuth(storedAuth({ accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() }), env)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Grant is revoked' }), { status: 400 }),
    )

    const provider = new OAuthTokenProvider(env)
    await expect(provider.getAccessToken()).rejects.toThrow(/auth login/)
  })

  it('converts a token response into stored auth', () => {
    const stored = storedAuthFromTokenResponse('https://api.example.com/v1', {
      access_token: 'ck_oat_x',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'ck_ort_x',
      scope: 'a b',
    })
    expect(stored.scopes).toEqual(['a', 'b'])
    expect(Date.parse(stored.accessTokenExpiresAt)).toBeGreaterThan(Date.now())
  })
})
