import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
}))

import { runAuthCommand } from '../src/auth/commands'
import { authFilePath, type StoredAuth } from '../src/auth/storage'

const tempDirs: string[] = []
function tempEnv(): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), 'ck-mcp-cmd-'))
  tempDirs.push(dir)
  return { CHURNKEY_CONFIG_DIR: dir }
}
function writeStored(env: NodeJS.ProcessEnv, overrides: Partial<StoredAuth> = {}) {
  const auth: StoredAuth = {
    baseUrl: 'https://api.example.com/v1',
    accessToken: 'ck_oat_x',
    accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    refreshToken: 'ck_ort_x',
    scopes: ['cancel_flows.blueprints.read'],
    ...overrides,
  }
  writeFileSync(authFilePath(env), JSON.stringify(auth))
}

let stderr: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  stderr = []
  process.exitCode = undefined
  while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true })
})
function captureStderr() {
  stderr = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk))
    return true
  })
}

describe('runAuthCommand — routing', () => {
  it('status: reports "not authenticated" with no stored creds', async () => {
    captureStderr()
    await runAuthCommand(['status'], tempEnv())
    expect(stderr.join('')).toMatch(/Not authenticated/)
  })

  it('status: notes CHURNKEY_API_KEY fallback when set & unauthenticated', async () => {
    captureStderr()
    const env = tempEnv()
    env.CHURNKEY_API_KEY = 'k'
    await runAuthCommand(['status'], env)
    expect(stderr.join('')).toMatch(/Data API key auth/)
  })

  it('status: reports valid token with expiry and scopes', async () => {
    const env = tempEnv()
    writeStored(env)
    captureStderr()
    await runAuthCommand(['status'], env)
    const out = stderr.join('')
    expect(out).toMatch(/Authenticated against https:\/\/api\.example\.com\/v1/)
    expect(out).toMatch(/valid until/)
    expect(out).toMatch(/cancel_flows\.blueprints\.read/)
  })

  it('status: reports expired token', async () => {
    const env = tempEnv()
    writeStored(env, { accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString() })
    captureStderr()
    await runAuthCommand(['status'], env)
    expect(stderr.join('')).toMatch(/expired \(will refresh automatically/)
  })

  it('logout: revokes and removes credentials', async () => {
    const env = tempEnv()
    writeStored(env)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    captureStderr()
    await runAuthCommand(['logout'], env)
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy.mock.calls[0][0] as string).toContain('/oauth/revoke')
    expect(existsSync(authFilePath(env))).toBe(false)
    expect(stderr.join('')).toMatch(/Revoked/)
  })

  it('logout: still removes local creds when revoke network call fails', async () => {
    const env = tempEnv()
    writeStored(env)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    captureStderr()
    await runAuthCommand(['logout'], env)
    expect(existsSync(authFilePath(env))).toBe(false)
    expect(stderr.join('')).toMatch(/Could not reach Churnkey/)
  })

  it('logout: reports "no stored credentials" when none exist', async () => {
    captureStderr()
    await runAuthCommand(['logout'], tempEnv())
    expect(stderr.join('')).toMatch(/No stored credentials/)
  })

  it('unknown subcommand: prints usage and sets exitCode=1', async () => {
    captureStderr()
    await runAuthCommand(['frobnicate'], tempEnv())
    expect(stderr.join('')).toMatch(/Unknown auth subcommand: frobnicate/)
    expect(stderr.join('')).toMatch(/Usage:/)
    expect(process.exitCode).toBe(1)
  })

  it('login (default subcommand): runs flow, stores tokens, prints granted scopes', async () => {
    const env = tempEnv()
    captureStderr()
    // Mock ONLY the token-exchange endpoint; let real fetch hit the loopback callback so the
    // flow actually completes end-to-end.
    const realFetch = globalThis.fetch.bind(globalThis)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (u.includes('/oauth/token')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'ck_oat_cmd',
              token_type: 'Bearer',
              expires_in: 3600,
              refresh_token: 'ck_ort_cmd',
              scope: 'cancel_flows.blueprints.read dsr.read',
            }),
            { status: 200 },
          ),
        )
      }
      return realFetch(input, init)
    })

    const flowDone = runAuthCommand([], env) // [] → default 'login'

    await vi.waitFor(() => {
      expect(stderr.join('').includes('/oauth/authorize')).toBe(true)
    })
    const authUrl = new URL(
      stderr
        .join('')
        .split(/\s/)
        .find((t) => t.includes('/oauth/authorize'))!,
    )
    const redirect = authUrl.searchParams.get('redirect_uri')!
    const state = authUrl.searchParams.get('state')!
    expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)

    // Simulate the browser redirect to the loopback callback.
    await realFetch(`${redirect}?code=auth_code&state=${encodeURIComponent(state)}`)
    await flowDone

    expect(existsSync(authFilePath(env))).toBe(true)
    const out = stderr.join('')
    // resolveBaseUrl defaults to the prod API base when CHURNKEY_API_URL is unset.
    expect(out).toMatch(/Authenticated with https:\/\/api\.churnkey\.co\/v1/)
    expect(out).toMatch(/Granted scopes/)
    expect(out).toMatch(/dsr\.read/)
  })

  it('login --scopes=a,b (equals form) parses scopes from the authorize URL', async () => {
    const env = tempEnv()
    captureStderr()
    const realFetch = globalThis.fetch.bind(globalThis)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (u.includes('/oauth/token'))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'a',
              token_type: 'Bearer',
              expires_in: 3600,
              refresh_token: 'r',
              scope: 'dns.read',
            }),
            { status: 200 },
          ),
        )
      return realFetch(input, init)
    })
    const flowDone = runAuthCommand(['login', '--scopes=dns.read'], env)
    await vi.waitFor(() => expect(stderr.join('').includes('/oauth/authorize')).toBe(true))
    const authUrl = new URL(
      stderr
        .join('')
        .split(/\s/)
        .find((t) => t.includes('/oauth/authorize'))!,
    )
    expect(authUrl.searchParams.get('scope')).toBe('dns.read')
    const redirect = authUrl.searchParams.get('redirect_uri')!
    const state = authUrl.searchParams.get('state')!
    await realFetch(`${redirect}?code=c&state=${encodeURIComponent(state)}`)
    await flowDone
  })

  it('login --scopes with an empty value falls back to DEFAULT_SCOPES', async () => {
    const env = tempEnv()
    captureStderr()
    const realFetch = globalThis.fetch.bind(globalThis)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (u.includes('/oauth/token'))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'a',
              token_type: 'Bearer',
              expires_in: 3600,
              refresh_token: 'r',
              scope: '',
            }),
            { status: 200 },
          ),
        )
      return realFetch(input, init)
    })
    // "--scopes" with empty trailing value → parseScopesFlag returns null → DEFAULT_SCOPES used.
    const flowDone = runAuthCommand(['login', '--scopes', ''], env)
    await vi.waitFor(() => expect(stderr.join('').includes('/oauth/authorize')).toBe(true))
    const authUrl = new URL(
      stderr
        .join('')
        .split(/\s/)
        .find((t) => t.includes('/oauth/authorize'))!,
    )
    const scopes = authUrl.searchParams.get('scope')!.split(' ')
    expect(scopes.length).toBeGreaterThan(20) // fell back to the full catalog
    const redirect = authUrl.searchParams.get('redirect_uri')!
    const state = authUrl.searchParams.get('state')!
    await realFetch(`${redirect}?code=c&state=${encodeURIComponent(state)}`)
    await flowDone
  })

  it('login --scopes overrides the default scope catalog in the authorize URL', async () => {
    const env = tempEnv()
    captureStderr()
    const realFetch = globalThis.fetch.bind(globalThis)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
      if (u.includes('/oauth/token')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'a',
              token_type: 'Bearer',
              expires_in: 3600,
              refresh_token: 'r',
              scope: 'dsr.read',
            }),
            { status: 200 },
          ),
        )
      }
      return realFetch(input, init)
    })

    const flowDone = runAuthCommand(['login', '--scopes', 'dsr.read,dsr.write'], env)
    await vi.waitFor(() => expect(stderr.join('').includes('/oauth/authorize')).toBe(true))
    const authUrl = new URL(
      stderr
        .join('')
        .split(/\s/)
        .find((t) => t.includes('/oauth/authorize'))!,
    )
    expect(authUrl.searchParams.get('scope')).toBe('dsr.read dsr.write')
    const redirect = authUrl.searchParams.get('redirect_uri')!
    const state = authUrl.searchParams.get('state')!
    await realFetch(`${redirect}?code=c&state=${encodeURIComponent(state)}`)
    await flowDone
  })
})
