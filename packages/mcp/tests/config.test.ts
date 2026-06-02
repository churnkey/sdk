import { describe, expect, it } from 'vitest'
import { loadConfig, loadHttpRequestConfig, loadHttpServerConfig } from '../src/config'

describe('config', () => {
  it('loads stdio config from environment variables', () => {
    expect(
      loadConfig({
        CHURNKEY_APP_ID: 'app_123',
        CHURNKEY_API_KEY: 'test_data_key',
        CHURNKEY_API_URL: 'https://api.example.com/v1/',
      }),
    ).toEqual({
      appId: 'app_123',
      apiKey: 'test_data_key',
      baseUrl: 'https://api.example.com/v1',
    })
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

  it('loads HTTP request credentials from headers before env fallback', () => {
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
      appId: 'app_header',
      apiKey: 'live_header_key',
      baseUrl: 'https://api.churnkey.co/v1',
    })
  })

  it('prefers x-ck-api-key over Authorization bearer tokens', () => {
    const headers = new Headers({
      authorization: 'Bearer bearer_key',
      'x-ck-api-key': 'header_key',
    })

    expect(
      loadHttpRequestConfig(headers, {
        CHURNKEY_APP_ID: 'app_env',
        CHURNKEY_API_KEY: 'env_key',
      }).apiKey,
    ).toBe('header_key')
  })

  it('requires an app id and API key for HTTP initialization', () => {
    expect(() => loadHttpRequestConfig(new Headers(), {})).toThrow(/App ID/)
    expect(() => loadHttpRequestConfig(new Headers({ 'x-ck-app': 'app_123' }), {})).toThrow(/API key/)
  })
})
