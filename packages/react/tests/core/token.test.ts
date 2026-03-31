import { describe, expect, it } from 'vitest'
import { decodeSessionToken } from '../../src/core/token'

function createToken(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload)
  // base64url encode
  const base64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `ck_${base64}`
}

describe('decodeSessionToken', () => {
  const validPayload = {
    a: 'app_123',
    c: 'cus_456',
    s: 'sub_789',
    h: 'abc123hash',
    m: 'live',
    t: 1700000000000,
  }

  it('decodes a valid token', () => {
    const token = createToken(validPayload)
    const creds = decodeSessionToken(token)

    expect(creds.appId).toBe('app_123')
    expect(creds.customerId).toBe('cus_456')
    expect(creds.subscriptionId).toBe('sub_789')
    expect(creds.authHash).toBe('abc123hash')
    expect(creds.mode).toBe('live')
    expect(creds.issuedAt).toBe(1700000000000)
  })

  it('decodes token without subscriptionId', () => {
    const token = createToken({ a: 'app_1', c: 'cus_1', h: 'hash1', m: 'live', t: 0 })
    const creds = decodeSessionToken(token)

    expect(creds.subscriptionId).toBeUndefined()
  })

  it('defaults mode to live when not "test"', () => {
    const token = createToken({ ...validPayload, m: 'anything' })
    const creds = decodeSessionToken(token)

    expect(creds.mode).toBe('live')
  })

  it('sets mode to test when m is "test"', () => {
    const token = createToken({ ...validPayload, m: 'test' })
    const creds = decodeSessionToken(token)

    expect(creds.mode).toBe('test')
  })

  it('throws on missing ck_ prefix', () => {
    expect(() => decodeSessionToken('invalid_token')).toThrow('must start with "ck_"')
  })

  it('throws on malformed base64', () => {
    expect(() => decodeSessionToken('ck_!!invalid!!')).toThrow('malformed')
  })

  it('throws on invalid JSON', () => {
    const encoded = btoa('not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(() => decodeSessionToken(`ck_${encoded}`)).toThrow('malformed JSON')
  })

  it('throws on missing appId', () => {
    const token = createToken({ c: 'cus', h: 'hash', m: 'live', t: 0 })
    expect(() => decodeSessionToken(token)).toThrow('missing appId')
  })

  it('throws on missing customerId', () => {
    const token = createToken({ a: 'app', h: 'hash', m: 'live', t: 0 })
    expect(() => decodeSessionToken(token)).toThrow('missing customerId')
  })

  it('throws on missing authHash', () => {
    const token = createToken({ a: 'app', c: 'cus', m: 'live', t: 0 })
    expect(() => decodeSessionToken(token)).toThrow('missing authHash')
  })

  it('roundtrips with the @churnkey/node token format', () => {
    // Simulate what the node SDK produces
    const payload = { a: 'app_x', c: 'cus_y', h: 'deadbeef', m: 'live', t: Date.now() }
    const json = JSON.stringify(payload)
    // Node uses Buffer.from(json).toString('base64url') which is equivalent
    const encoded = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const token = `ck_${encoded}`

    const creds = decodeSessionToken(token)
    expect(creds.appId).toBe('app_x')
    expect(creds.customerId).toBe('cus_y')
    expect(creds.authHash).toBe('deadbeef')
  })
})
