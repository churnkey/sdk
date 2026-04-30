import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChurnkeyApi } from '../../src/core/api'
import type { SessionCredentials } from '../../src/core/token'

// Pins the action path and body shape for every cancel-flow action so a
// server/SDK drift produces a test failure rather than a runtime 404.
// Backend alias routes live in churnkey-api/src/api/org/index.js alongside
// the legacy /stripe/* paths the hosted embed still uses.

const creds: SessionCredentials = {
  appId: 'app_test',
  customerId: 'cus_123',
  authHash: 'hash',
  mode: 'live',
  issuedAt: 0,
}

function spyFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
}

function calledPath(spy: ReturnType<typeof spyFetch>): string {
  const url = spy.mock.calls[0][0]
  return typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
}

function calledBody(spy: ReturnType<typeof spyFetch>): Record<string, unknown> {
  return JSON.parse(spy.mock.calls[0][1]?.body as string)
}

describe('ChurnkeyApi action paths', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applyDiscount hits cancel-flow/actions/discount with coupon + blueprintId', async () => {
    const spy = spyFetch()
    const api = new ChurnkeyApi(creds, 'https://api.test/v1')
    await api.applyDiscount('coupon_abc', 'bp_1')
    expect(calledPath(spy)).toBe('https://api.test/v1/api/orgs/app_test/cancel-flow/actions/discount')
    expect(calledBody(spy)).toEqual({ coupon: 'coupon_abc', blueprintId: 'bp_1' })
  })

  it('pause hits cancel-flow/actions/pause with duration + interval', async () => {
    const spy = spyFetch()
    const api = new ChurnkeyApi(creds, 'https://api.test/v1')
    await api.pause({ duration: 2, interval: 'month' })
    expect(calledPath(spy)).toBe('https://api.test/v1/api/orgs/app_test/cancel-flow/actions/pause')
    expect(calledBody(spy)).toEqual({ duration: 2, interval: 'month' })
  })

  it('cancelSubscription hits cancel-flow/actions/cancel with cancelAtPeriodEnd: true', async () => {
    const spy = spyFetch()
    const api = new ChurnkeyApi(creds, 'https://api.test/v1')
    await api.cancelSubscription()
    expect(calledPath(spy)).toBe('https://api.test/v1/api/orgs/app_test/cancel-flow/actions/cancel')
    expect(calledBody(spy)).toEqual({ cancelAtPeriodEnd: true })
  })

  it('changePlan hits cancel-flow/actions/change-plan with planId', async () => {
    const spy = spyFetch()
    const api = new ChurnkeyApi(creds, 'https://api.test/v1')
    await api.changePlan('plan_pro')
    expect(calledPath(spy)).toBe('https://api.test/v1/api/orgs/app_test/cancel-flow/actions/change-plan')
    expect(calledBody(spy)).toEqual({ planId: 'plan_pro' })
  })

  it('extendTrial hits cancel-flow/actions/extend-trial with days + blueprintId', async () => {
    const spy = spyFetch()
    const api = new ChurnkeyApi(creds, 'https://api.test/v1')
    await api.extendTrial(14, 'bp_1')
    expect(calledPath(spy)).toBe('https://api.test/v1/api/orgs/app_test/cancel-flow/actions/extend-trial')
    expect(calledBody(spy)).toEqual({ days: 14, blueprintId: 'bp_1' })
  })

  it('fetchConfig hits /cancel-flow/config', async () => {
    const spy = spyFetch()
    const api = new ChurnkeyApi(creds, 'https://api.test/v1')
    await api.fetchConfig()
    expect(calledPath(spy)).toBe('https://api.test/v1/api/orgs/app_test/cancel-flow/config')
  })

  it('createSession hits /api/sessions/sdk', async () => {
    const spy = spyFetch()
    const api = new ChurnkeyApi(creds, 'https://api.test/v1')
    await api.createSession({ canceled: true, presentedOffers: [], stepsViewed: [], mode: 'LIVE' })
    expect(calledPath(spy)).toBe('https://api.test/v1/api/sessions/sdk')
  })

  it('sends auth headers from creds', async () => {
    const spy = spyFetch()
    const api = new ChurnkeyApi({ ...creds, subscriptionId: 'sub_456' }, 'https://api.test/v1')
    await api.pause({ duration: 1, interval: 'month' })
    const headers = spy.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers['x-ck-app']).toBe('app_test')
    expect(headers['x-ck-customer']).toBe('cus_123')
    expect(headers['x-ck-authorization']).toBe('hash')
    expect(headers['x-ck-mode']).toBe('live')
    expect(headers['x-ck-subscription']).toBe('sub_456')
  })

  it('throws on non-2xx response with status in message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }))
    const api = new ChurnkeyApi(creds, 'https://api.test/v1')
    await expect(api.changePlan('plan_pro')).rejects.toThrow(/404/)
  })
})
