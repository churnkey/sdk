import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, loadHttpRequestConfig, loadHttpServerConfig } from '../src/config'

const tempDirs: string[] = []
function tempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ck-mcp-config-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

describe('config', () => {
  it('loads deprecated Data API key auth from environment variables', () => {
    expect(
      loadConfig({
        CHURNKEY_APP_ID: 'app_123',
        CHURNKEY_API_KEY: 'test_data_key',
        CHURNKEY_API_URL: 'https://api.example.com/v1/',
      }),
    ).toEqual({
      baseUrl: 'https://api.example.com/v1',
      auth: { kind: 'data-api-key', appId: 'app_123', apiKey: 'test_data_key' },
    })
  })

  it('falls back to stored OAuth credentials when env vars are absent', () => {
    const dir = tempConfigDir()
    writeFileSync(
      join(dir, 'mcp-auth.json'),
      JSON.stringify({
        baseUrl: 'https://api.example.com/v1',
        accessToken: 'ck_oat_abc',
        accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
        refreshToken: 'ck_ort_abc',
        scopes: ['cancel_flows.blueprints.read'],
      }),
    )

    expect(loadConfig({ CHURNKEY_CONFIG_DIR: dir })).toEqual({
      baseUrl: 'https://api.example.com/v1',
      auth: { kind: 'oauth' },
      mode: undefined,
    })
  })

  it('honors CHURNKEY_MODE=test for OAuth sessions', () => {
    const dir = tempConfigDir()
    writeFileSync(
      join(dir, 'mcp-auth.json'),
      JSON.stringify({
        baseUrl: 'https://api.example.com/v1',
        accessToken: 'ck_oat_abc',
        accessTokenExpiresAt: new Date().toISOString(),
        refreshToken: 'ck_ort_abc',
        scopes: [],
      }),
    )

    expect(loadConfig({ CHURNKEY_CONFIG_DIR: dir, CHURNKEY_MODE: 'test' }).mode).toBe('test')
  })

  it('throws a sign-in hint when no credentials are available', () => {
    expect(() => loadConfig({ CHURNKEY_CONFIG_DIR: tempConfigDir() })).toThrow(/auth login/)
  })

  it('loads HTTP server config with defaults and validates the port', () => {
    expect(loadHttpServerConfig({})).toEqual({
      host: '127.0.0.1',
      port: 3333,
      path: '/mcp',
      allowedHosts: undefined,
    })

    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_PORT: 'nope' })).toThrow(/CHURNKEY_MCP_PORT/)
    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_PATH: 'mcp' })).toThrow(/CHURNKEY_MCP_PATH/)
  })

  it('treats an OAuth access token bearer as hosted bearer auth (no app id needed)', () => {
    const headers = new Headers({
      authorization: 'Bearer ck_oat_token123',
      'x-ck-mode': 'test',
    })

    expect(loadHttpRequestConfig(headers, {})).toEqual({
      baseUrl: 'https://api.churnkey.co/v1',
      auth: { kind: 'bearer', token: 'ck_oat_token123' },
      mode: 'test',
    })
  })

  it('loads HTTP request Data API key credentials from headers before env fallback', () => {
    const headers = new Headers({
      authorization: 'Bearer live_header_key',
      'x-ck-app': 'app_header',
    })

    expect(
      loadHttpRequestConfig(headers, {
        CHURNKEY_APP_ID: 'app_env',
        CHURNKEY_API_KEY: 'env_key',
      }),
    ).toEqual({
      baseUrl: 'https://api.churnkey.co/v1',
      auth: { kind: 'data-api-key', appId: 'app_header', apiKey: 'live_header_key' },
    })
  })

  it('prefers x-ck-api-key over non-OAuth Authorization bearer tokens', () => {
    const headers = new Headers({
      authorization: 'Bearer bearer_key',
      'x-ck-api-key': 'header_key',
    })

    const config = loadHttpRequestConfig(headers, {
      CHURNKEY_APP_ID: 'app_env',
      CHURNKEY_API_KEY: 'env_key',
    })
    expect(config.auth).toEqual({ kind: 'data-api-key', appId: 'app_env', apiKey: 'header_key' })
  })

  it('requires an app id and credentials for HTTP initialization without an OAuth bearer', () => {
    expect(() => loadHttpRequestConfig(new Headers(), {})).toThrow(/App ID/)
    expect(() => loadHttpRequestConfig(new Headers({ 'x-ck-app': 'app_123' }), {})).toThrow(/credentials/i)
  })
})
