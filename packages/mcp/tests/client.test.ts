import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChurnkeyClient } from '../src/client'

function makeClient() {
  return new ChurnkeyClient({ appId: 'app_123', apiKey: 'test_key', baseUrl: 'https://api.example.com/v1' })
}

function mockFetch(body: string, status: number, headers?: Record<string, string>) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status, headers }))
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

  it('keeps the credential hint for 401 regardless of body', async () => {
    mockFetch('unauthorized', 401)
    await expect(makeClient().get('/data/blueprints')).rejects.toThrow(/credentials/i)
  })

  it('gives a typed fallback for an empty 403 body', async () => {
    mockFetch('', 403)
    await expect(makeClient().get('/data/blueprints')).rejects.toThrow(/403/)
  })
})
