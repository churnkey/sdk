import { afterEach, describe, expect, it, vi } from 'vitest'
import { Churnkey, ChurnkeyApiError } from '../src/index'

function client(apiBase?: string) {
  return new Churnkey({ appId: 'app_123', apiKey: 'sk_test', apiBase })
}

function fetchOnce(status: number, body = '') {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }))
}

function fetchAlways(status: number, body = '') {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(body, { status }))
}

function sentBody(spy: ReturnType<typeof fetchOnce>, call = 0) {
  return JSON.parse(spy.mock.calls[call][1]!.body as string)
}

afterEach(() => vi.restoreAllMocks())

describe('track', () => {
  it('posts to /v1/api/events/new with the API-key headers', async () => {
    const spy = fetchOnce(200, '{"status":"success"}')
    await client().track({ event: 'Job Scheduled', customerId: 'cus_1' })

    expect(spy).toHaveBeenCalledTimes(1)
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('https://api.churnkey.co/v1/api/events/new')
    expect(init!.method).toBe('POST')
    expect(init!.headers).toEqual({
      'x-ck-api-key': 'sk_test',
      'x-ck-app': 'app_123',
      'content-type': 'application/json',
    })
    expect(sentBody(spy)).toEqual({ event: 'Job Scheduled', customerId: 'cus_1' })
  })

  it('maps properties, userUid and timestamp onto the wire shape', async () => {
    const spy = fetchOnce(200)
    const when = new Date('2026-01-02T03:04:05.000Z')
    await client().track({
      event: 'Report Exported',
      customerId: 'cus_1',
      uid: 'acct_9',
      userUid: 'user_7',
      properties: { format: 'csv', rows: 120, scheduled: false, ranAt: when },
      timestamp: when,
    })

    expect(sentBody(spy)).toEqual({
      event: 'Report Exported',
      customerId: 'cus_1',
      uid: 'acct_9',
      user: { uid: 'user_7' },
      eventData: { format: 'csv', rows: 120, scheduled: false, ranAt: '2026-01-02T03:04:05.000Z' },
      eventDate: '2026-01-02T03:04:05.000Z',
    })
  })

  it('accepts uid without customerId', async () => {
    const spy = fetchOnce(200)
    await client().track({ event: 'Signed In', uid: 'acct_9' })
    expect(sentBody(spy)).toEqual({ event: 'Signed In', uid: 'acct_9' })
  })

  it('honours apiBase and strips a trailing slash', async () => {
    const spy = fetchOnce(200)
    await client('https://api-dev.churnkey.co/').track({ event: 'Signed In', uid: 'acct_9' })
    expect(spy.mock.calls[0][0]).toBe('https://api-dev.churnkey.co/v1/api/events/new')
  })

  it('rejects without calling fetch when event is empty', async () => {
    const spy = fetchOnce(200)
    await expect(client().track({ event: '', customerId: 'cus_1' })).rejects.toThrow('event is required')
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects without calling fetch when neither customerId nor uid is given', async () => {
    const spy = fetchOnce(200)
    await expect(client().track({ event: 'Signed In' })).rejects.toThrow('customerId or uid is required')
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects with the status and body on a non-2xx response', async () => {
    fetchOnce(429, '  {"error":"Too many requests"}\n')
    const err = await client()
      .track({ event: 'Signed In', uid: 'acct_9' })
      .catch((e) => e)

    expect(err).toBeInstanceOf(ChurnkeyApiError)
    expect(err.status).toBe(429)
    expect(err.body).toBe('{"error":"Too many requests"}')
    expect(err.message).toBe('Churnkey API responded with 429: {"error":"Too many requests"}')
  })

  it('omits the body from the message when the server sent none', async () => {
    fetchOnce(500)
    await expect(client().track({ event: 'Signed In', uid: 'acct_9' })).rejects.toThrow(
      'Churnkey API responded with 500',
    )
  })
})

describe('trackBatch', () => {
  it('posts an array to /v1/api/events/bulk', async () => {
    const spy = fetchOnce(200)
    await client().trackBatch([
      { event: 'Job Scheduled', customerId: 'cus_1' },
      { event: 'Job Completed', customerId: 'cus_1', properties: { durationMs: 40 } },
    ])

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('https://api.churnkey.co/v1/api/events/bulk')
    expect(sentBody(spy)).toEqual([
      { event: 'Job Scheduled', customerId: 'cus_1' },
      { event: 'Job Completed', customerId: 'cus_1', eventData: { durationMs: 40 } },
    ])
  })

  it('splits more than 100 events into requests of 100', async () => {
    const spy = fetchAlways(200)
    const events = Array.from({ length: 250 }, (_, i) => ({ event: 'Job Scheduled', uid: `acct_${i}` }))
    await client().trackBatch(events)

    expect(spy).toHaveBeenCalledTimes(3)
    expect(sentBody(spy, 0)).toHaveLength(100)
    expect(sentBody(spy, 1)).toHaveLength(100)
    expect(sentBody(spy, 2)).toHaveLength(50)
    expect(sentBody(spy, 2)[0].uid).toBe('acct_200')
  })

  it('sends nothing for an empty list', async () => {
    const spy = fetchOnce(200)
    await client().trackBatch([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('validates every item before sending any request', async () => {
    const spy = fetchOnce(200)
    await expect(
      client().trackBatch([{ event: 'Job Scheduled', uid: 'acct_1' }, { event: 'Job Scheduled' }]),
    ).rejects.toThrow('customerId or uid is required')
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects with the status when a chunk fails', async () => {
    fetchOnce(404, 'Not found')
    const err = await client()
      .trackBatch([{ event: 'Job Scheduled', uid: 'acct_1' }])
      .catch((e) => e)
    expect(err).toBeInstanceOf(ChurnkeyApiError)
    expect(err.status).toBe(404)
  })
})
