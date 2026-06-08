import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'

const requiredEnv = {
  CHURNKEY_APP_ID: 'app_123',
  CHURNKEY_API_KEY: 'key_123',
}

describe('loadConfig', () => {
  it('uses production API by default', () => {
    expect(loadConfig(requiredEnv).baseUrl).toBe('https://api.churnkey.co/v1')
  })

  it('uses localhost:3000 when the local server toggle is enabled', () => {
    expect(loadConfig({ ...requiredEnv, CHURNKEY_USE_LOCAL_SERVER: 'true' }).baseUrl).toBe('http://localhost:3000/v1')
  })

  it('lets an explicit API URL override the local server toggle', () => {
    expect(
      loadConfig({
        ...requiredEnv,
        CHURNKEY_USE_LOCAL_SERVER: 'true',
        CHURNKEY_API_URL: 'http://localhost:4000/v1/',
      }).baseUrl,
    ).toBe('http://localhost:4000/v1')
  })
})
