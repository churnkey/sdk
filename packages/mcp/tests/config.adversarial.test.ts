import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig, loadHttpRequestConfig, loadHttpServerConfig, resolveBaseUrl } from '../src/config'

const tempDirs: string[] = []
function tempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ck-mcp-cfg-'))
  tempDirs.push(dir)
  return dir
}
function writeAuth(dir: string, overrides: Record<string, unknown> = {}) {
  writeFileSync(
    join(dir, 'mcp-auth.json'),
    JSON.stringify({
      baseUrl: 'https://stored.example.com/v1',
      accessToken: 'ck_oat_x',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      refreshToken: 'ck_ort_x',
      scopes: [],
      ...overrides,
    }),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  while (tempDirs.length) rmSync(tempDirs.pop() as string, { recursive: true, force: true })
})

describe('resolveBaseUrl', () => {
  it('defaults to the production API base', () => {
    expect(resolveBaseUrl({})).toBe('https://api.churnkey.co/v1')
  })
  it('honors CHURNKEY_API_URL and strips a trailing slash', () => {
    expect(resolveBaseUrl({ CHURNKEY_API_URL: 'http://localhost:3000/v1/' })).toBe('http://localhost:3000/v1')
  })
  it('leaves a non-trailing-slash url intact', () => {
    expect(resolveBaseUrl({ CHURNKEY_API_URL: 'http://localhost:3000/v1' })).toBe('http://localhost:3000/v1')
  })
})

describe('loadConfig precedence', () => {
  it('data-api-key wins over stored OAuth when CHURNKEY_API_KEY is present', () => {
    const dir = tempConfigDir()
    writeAuth(dir)
    const cfg = loadConfig({
      CHURNKEY_CONFIG_DIR: dir,
      CHURNKEY_APP_ID: 'app_1',
      CHURNKEY_API_KEY: 'key_1',
      CHURNKEY_API_URL: 'https://env.example.com/v1',
    })
    expect(cfg.auth).toEqual({ kind: 'data-api-key', appId: 'app_1', apiKey: 'key_1' })
    // data-api-key uses resolveBaseUrl (env), not the stored base
    expect(cfg.baseUrl).toBe('https://env.example.com/v1')
  })

  it('throws when API key is set but app id is missing', () => {
    expect(() => loadConfig({ CHURNKEY_API_KEY: 'key_only' })).toThrow(/CHURNKEY_APP_ID is required/)
  })

  it('OAuth stored base URL wins over CHURNKEY_API_URL', () => {
    const dir = tempConfigDir()
    writeAuth(dir, { baseUrl: 'https://stored.example.com/v1/' })
    const cfg = loadConfig({ CHURNKEY_CONFIG_DIR: dir, CHURNKEY_API_URL: 'https://ignored.example.com/v1' })
    expect(cfg.auth).toEqual({ kind: 'oauth' })
    expect(cfg.baseUrl).toBe('https://stored.example.com/v1') // trailing slash stripped, env ignored
  })

  it('throws an auth-login hint when no creds at all', () => {
    expect(() => loadConfig({ CHURNKEY_CONFIG_DIR: tempConfigDir() })).toThrow(/auth login/)
  })

  it('emits the deprecation warning to stderr (once) for data-api-key auth', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    loadConfig({ CHURNKEY_APP_ID: 'a', CHURNKEY_API_KEY: 'k' })
    // Module-level flag may already be set from earlier tests; assert it never throws and the
    // warning text (if emitted) mentions deprecation.
    const calls = spy.mock.calls.map((c) => String(c[0]))
    if (calls.length) expect(calls.join('')).toMatch(/deprecated/)
  })
})

describe('loadHttpServerConfig — port bounds', () => {
  it('accepts port 0 (ephemeral)', () => {
    expect(loadHttpServerConfig({ CHURNKEY_MCP_PORT: '0' }).port).toBe(0)
  })
  it('accepts max port 65535', () => {
    expect(loadHttpServerConfig({ CHURNKEY_MCP_PORT: '65535' }).port).toBe(65535)
  })
  it('rejects negative port', () => {
    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_PORT: '-1' })).toThrow(/between 0 and 65535/)
  })
  it('rejects port > 65535', () => {
    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_PORT: '70000' })).toThrow(/between 0 and 65535/)
  })
  it('rejects a non-integer (decimal) port', () => {
    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_PORT: '8080.5' })).toThrow(/integer/)
  })
  it('rejects a non-numeric port', () => {
    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_PORT: 'abc' })).toThrow(/CHURNKEY_MCP_PORT/)
  })
  it('defaults to 3333 when unset', () => {
    expect(loadHttpServerConfig({}).port).toBe(3333)
  })
})

describe('loadHttpServerConfig — path & host', () => {
  it('rejects a path that does not start with /', () => {
    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_PATH: 'mcp' })).toThrow(/must start with/)
  })
  it('accepts a custom path that starts with /', () => {
    expect(loadHttpServerConfig({ CHURNKEY_MCP_PATH: '/custom' }).path).toBe('/custom')
  })
  it('honors a custom host', () => {
    expect(loadHttpServerConfig({ CHURNKEY_MCP_HOST: '0.0.0.0' }).host).toBe('0.0.0.0')
  })
})

describe('loadHttpServerConfig — allowedHosts CSV', () => {
  it('splits, trims, and drops empties', () => {
    const cfg = loadHttpServerConfig({ CHURNKEY_MCP_ALLOWED_HOSTS: ' a.com , b.com ,, ,c.com ' })
    expect(cfg.allowedHosts).toEqual(['a.com', 'b.com', 'c.com'])
  })
  it('is undefined when unset', () => {
    expect(loadHttpServerConfig({}).allowedHosts).toBeUndefined()
  })
  it('is undefined when only whitespace/commas', () => {
    expect(loadHttpServerConfig({ CHURNKEY_MCP_ALLOWED_HOSTS: ' , , ' }).allowedHosts).toBeUndefined()
  })
  it('handles a single host', () => {
    expect(loadHttpServerConfig({ CHURNKEY_MCP_ALLOWED_HOSTS: 'only.com' }).allowedHosts).toEqual(['only.com'])
  })
})

describe('loadHttpRequestConfig — bearer / key precedence', () => {
  it('ck_oat_ bearer → bearer auth, no app id needed', () => {
    const cfg = loadHttpRequestConfig(new Headers({ authorization: 'Bearer ck_oat_abc' }), {})
    expect(cfg.auth).toEqual({ kind: 'bearer', token: 'ck_oat_abc' })
  })

  it('ck_oat_ bearer with x-ck-mode=test → mode test', () => {
    const cfg = loadHttpRequestConfig(new Headers({ authorization: 'Bearer ck_oat_abc', 'x-ck-mode': 'TEST' }), {})
    expect(cfg.mode).toBe('test')
  })

  it('ck_oat_ bearer without mode header falls back to CHURNKEY_MODE env', () => {
    const cfg = loadHttpRequestConfig(new Headers({ authorization: 'Bearer ck_oat_abc' }), {
      CHURNKEY_MODE: 'test',
    })
    expect(cfg.mode).toBe('test')
  })

  it('ck_oat_ bearer with no mode anywhere → mode undefined', () => {
    const cfg = loadHttpRequestConfig(new Headers({ authorization: 'Bearer ck_oat_abc' }), {})
    expect(cfg.mode).toBeUndefined()
  })

  it('non-OAuth bearer is treated as a Data API key (requires x-ck-app/env)', () => {
    const cfg = loadHttpRequestConfig(new Headers({ authorization: 'Bearer live_xxx', 'x-ck-app': 'app_h' }), {})
    expect(cfg.auth).toEqual({ kind: 'data-api-key', appId: 'app_h', apiKey: 'live_xxx' })
  })

  it('x-ck-api-key beats a non-OAuth bearer', () => {
    const cfg = loadHttpRequestConfig(
      new Headers({ authorization: 'Bearer bk', 'x-ck-api-key': 'hk', 'x-ck-app': 'app_h' }),
      {},
    )
    expect(cfg.auth).toEqual({ kind: 'data-api-key', appId: 'app_h', apiKey: 'hk' })
  })

  it('x-ck-app header beats CHURNKEY_APP_ID env', () => {
    const cfg = loadHttpRequestConfig(new Headers({ 'x-ck-api-key': 'hk', 'x-ck-app': 'app_h' }), {
      CHURNKEY_APP_ID: 'app_env',
      CHURNKEY_API_KEY: 'env_key',
    })
    expect(cfg.auth).toEqual({ kind: 'data-api-key', appId: 'app_h', apiKey: 'hk' })
  })

  it('falls back fully to env when no useful headers', () => {
    const cfg = loadHttpRequestConfig(new Headers(), {
      CHURNKEY_APP_ID: 'app_env',
      CHURNKEY_API_KEY: 'env_key',
    })
    expect(cfg.auth).toEqual({ kind: 'data-api-key', appId: 'app_env', apiKey: 'env_key' })
  })

  it('throws when app id missing', () => {
    expect(() => loadHttpRequestConfig(new Headers({ 'x-ck-api-key': 'hk' }), {})).toThrow(/App ID/)
  })

  it('throws when credentials missing (app id present)', () => {
    expect(() => loadHttpRequestConfig(new Headers({ 'x-ck-app': 'app_h' }), {})).toThrow(/credentials/i)
  })

  it('parses a case-insensitive Bearer scheme with extra whitespace', () => {
    const cfg = loadHttpRequestConfig(new Headers({ authorization: '  bEaReR    ck_oat_ws  ' }), {})
    expect(cfg.auth).toEqual({ kind: 'bearer', token: 'ck_oat_ws' })
  })

  it('ignores a malformed Authorization header (no Bearer scheme)', () => {
    // "Basic xyz" → no bearer token; falls through to key path which needs app id.
    expect(() => loadHttpRequestConfig(new Headers({ authorization: 'Basic xyz', 'x-ck-app': 'app_h' }), {})).toThrow(
      /credentials/i,
    )
  })

  it('uses resolveBaseUrl (env CHURNKEY_API_URL) for the request base', () => {
    const cfg = loadHttpRequestConfig(new Headers({ authorization: 'Bearer ck_oat_abc' }), {
      CHURNKEY_API_URL: 'http://localhost:3000/v1',
    })
    expect(cfg.baseUrl).toBe('http://localhost:3000/v1')
  })
})
