import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_URI, loadDashboard } from '../../src/apps/dashboard'
import { APPLY_TOOL, describeOffer, PROPOSE_TOOL } from '../../src/apps/offer-change'
import { cleanQuote, groupQuotes, summarizeReasons } from '../../src/apps/reasons'
import type { ChurnkeyClient } from '../../src/client'
import { createServer } from '../../src/server'

const config = {
  baseUrl: 'https://api.example.com/v1',
  auth: { kind: 'data-api-key' as const, appId: 'a', apiKey: 'k' },
}

describe('Why they cancel: counts', () => {
  it('buckets each answer by outcome and computes share and save rate', () => {
    const result = summarizeReasons(
      [
        { response: 'Too expensive', saveType: null, count: 30 },
        { response: 'Too expensive', saveType: 'DISCOUNT', count: '10' },
        { response: 'Too expensive', saveType: 'ABANDON', count: 10 },
        { response: 'Not using it', saveType: 'PAUSE', count: 25 },
        { response: 'Not using it', saveType: null, count: 25 },
      ],
      new Map(),
    )
    expect(result?.total).toBe(100)
    expect(result?.rows).toEqual([
      { reason: 'Too expensive', kind: 'answer', total: 50, share: 0.5, saveRate: 0.2, quotes: [] },
      { reason: 'Not using it', kind: 'answer', total: 50, share: 0.5, saveRate: 0.5, quotes: [] },
    ])
  })

  it('folds the long tail into Other and puts unanswered sessions last', () => {
    const rows = [
      { response: null, saveType: null, count: 500 },
      ...Array.from({ length: 8 }, (_, i) => ({ response: `Reason ${i}`, saveType: null, count: 80 - i })),
    ]
    const result = summarizeReasons(rows, new Map())
    const names = result?.rows.map((r) => r.reason)
    expect(names).toEqual([
      'Reason 0',
      'Reason 1',
      'Reason 2',
      'Reason 3',
      'Reason 4',
      'Reason 5',
      'Other',
      'No answer',
    ])
    expect(result?.rows.find((r) => r.reason === 'Other')).toMatchObject({ kind: 'other', total: 74 + 73 })
    expect(result?.rows.at(-1)).toMatchObject({ kind: 'none', total: 500 })
  })

  it('hides the panel when no session answered a survey', () => {
    expect(summarizeReasons([{ response: null, saveType: null, count: 40 }], new Map())).toBeNull()
    expect(summarizeReasons([], new Map())).toBeNull()
  })
})

describe('Why they cancel: quotes', () => {
  it('takes the freeform comment, else the follow-up answer, and caps each reason at three', () => {
    const quotes = groupQuotes([
      { surveyChoiceValue: 'Too expensive', feedback: 'Prices went up again this year.' },
      { surveyChoiceValue: 'Too expensive', feedback: null, followupResponse: 'A cheaper tier would keep me.' },
      { surveyChoiceValue: 'Too expensive', feedback: 'Prices went up again this year.' },
      { surveyChoiceValue: 'Too expensive', feedback: 'Budget cuts at work this quarter.' },
      { surveyChoiceValue: 'Too expensive', feedback: 'Fourth comment that should not appear.' },
      { surveyChoiceValue: 'Too expensive', feedback: 'ok' },
      { surveyChoiceValue: 'Missing a feature', feedback: '   ' },
    ])
    expect(quotes.get('Too expensive')).toEqual([
      'Prices went up again this year.',
      'A cheaper tier would keep me.',
      'Budget cuts at work this quarter.',
    ])
    expect(quotes.has('Missing a feature')).toBe(false)
  })

  it('removes emails and phone numbers and truncates long comments', () => {
    expect(cleanQuote('Email me at jane.doe+ck@example.co.uk or call +1 (415) 555-0100 please')).toBe(
      'Email me at [email] or call [number] please',
    )
    const long = cleanQuote('word '.repeat(80)) as string
    expect(long.length).toBeLessThanOrEqual(180)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('Why they cancel: loading', () => {
  const now = new Date('2026-09-29T12:00:00Z')

  function stub(overrides: Record<string, (query: Record<string, unknown>) => unknown> = {}) {
    return {
      mode: 'live',
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        const query = options?.query ?? {}
        const key = path === '/data/warehouse/session-aggregation' ? `${path}?${query.breakdown}` : path
        if (overrides[key]) return overrides[key](query)
        switch (key) {
          case '/data/flow-metrics':
            return {
              totalSessions: 0,
              customersSaved: 0,
              saveRate: null,
              boostedRevenueUSD: 0,
              averageBoostedRevenueUSD: null,
              sessionOutcomes: { saved: { total: 0, byOfferType: {} }, canceled: 0, abandoned: 0 },
              sampleSizeWarning: null,
              summary: '',
            }
          case '/data/warehouse/session-aggregation?response-saveType':
            return [
              { response: 'Too expensive', saveType: null, count: 3 },
              { response: 'Too expensive', saveType: 'DISCOUNT', count: 1 },
            ]
          case '/data/warehouse/sessions':
            return [{ surveyChoiceValue: 'Too expensive', feedback: 'Too pricey for a small team.' }]
          default:
            return []
        }
      }),
    } as unknown as ChurnkeyClient
  }

  it('scopes both calls to the window and the selected segment', async () => {
    const client = stub()
    const data = await loadDashboard(client, { window: '30d', segmentId: 'seg_new' }, now)
    expect(data.reasons?.rows[0]).toMatchObject({ reason: 'Too expensive', total: 4, saveRate: 0.25 })
    expect(data.reasons?.rows[0].quotes).toEqual(['Too pricey for a small team.'])

    const calls = (client.get as ReturnType<typeof vi.fn>).mock.calls
    const agg = calls.find(
      ([p, o]) => p === '/data/warehouse/session-aggregation' && o.query.breakdown === 'response-saveType',
    )
    const list = calls.find(([p]) => p === '/data/warehouse/sessions')
    for (const call of [agg, list]) {
      expect(call?.[1].query).toMatchObject({ startDate: '2026-08-30', endDate: '2026-09-29', segmentId: 'seg_new' })
    }
    expect(list?.[1].query.limit).toBe(200)
  })

  it('keeps the counts when the session list is forbidden', async () => {
    const client = stub({
      '/data/warehouse/sessions': () => {
        throw new Error('Missing required scope: cancel_flows.sessions.read')
      },
    })
    const data = await loadDashboard(client, {}, now)
    expect(data.reasons?.rows[0]).toMatchObject({ reason: 'Too expensive', quotes: [] })
  })

  it('hides the panel, not the dashboard, when the breakdown fails', async () => {
    const client = stub({
      '/data/warehouse/session-aggregation?response-saveType': () => {
        throw new Error('Warehouse unavailable')
      },
    })
    const data = await loadDashboard(client, {}, now)
    expect(data.reasons).toBeNull()
    expect(data.metrics).toBeTruthy()
  })
})

// ---------- offer changes ----------

const draft = {
  _id: 'bp_annual_draft',
  steps: [
    {
      guid: 'step_offer',
      stepType: 'OFFER',
      offer: {
        offerType: 'DISCOUNT',
        header: 'Stay for less',
        discountConfig: {
          couponId: 'SAVE20',
          coupon: { name: 'Save 20', percentOff: 20, duration: 'repeating', durationInMonths: 3 },
        },
      },
    },
    {
      guid: 'step_survey',
      stepType: 'SURVEY',
      survey: {
        choices: [
          {
            guid: 'c_price',
            value: 'Too expensive',
            offer: { offerType: 'PAUSE', pauseConfig: { maxPauseLength: 1 } },
          },
          { guid: 'c_usage', value: 'Not using it enough' },
        ],
      },
    },
  ],
}

const requests: Array<{ method: string; path: string; body: unknown }> = []

async function fakeApi(input: URL | string, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const method = init?.method ?? 'GET'
  requests.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined })
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  if (method === 'GET' && url.pathname === '/v1/data/blueprints') {
    return json({
      flows: [
        { flowId: 'org', scope: 'org', editableBlueprintId: 'bp_org' },
        {
          flowId: 'seg_annual',
          scope: 'segment',
          editableBlueprintId: 'bp_annual_draft',
          segment: { id: 'seg_annual', name: 'Annual plans' },
        },
        { flowId: 'seg_new', scope: 'segment', editableBlueprintId: null, segment: { id: 'seg_new', name: 'New' } },
      ],
    })
  }
  if (method === 'GET' && url.pathname === '/v1/data/blueprints/bp_annual_draft') return json(draft)
  if (method === 'POST' && url.pathname === '/v1/data/blueprints/bp_annual_draft/offer') {
    return json({ blueprintId: 'bp_annual_draft', changedFields: ['offerType'] })
  }
  return new Response('Not found', { status: 404 })
}

const fetchMock = vi.fn(fakeApi)

async function connect() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' }, { capabilities: {} })
  await Promise.all([createServer(config).connect(serverSide), client.connect(clientSide)])
  return client
}

beforeEach(() => {
  requests.length = 0
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(fakeApi)
  vi.unstubAllGlobals()
})

describe('propose_offer_change', () => {
  it('renders in the dashboard app, is visible to the model, and only reads', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    const tool = tools.find((t) => t.name === PROPOSE_TOOL)
    expect(tool?._meta).toMatchObject({ ui: { resourceUri: DASHBOARD_URI }, 'ui/resourceUri': DASHBOARD_URI })
    expect((tool?._meta as { ui: { visibility?: string[] } }).ui.visibility).toBeUndefined()
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false })
    await client.close()
  })

  it('targets the survey answer and shows the current and proposed offer', async () => {
    const client = await connect()
    const result = await client.callTool({
      name: PROPOSE_TOOL,
      arguments: {
        segmentId: 'seg_annual',
        reason: '  too EXPENSIVE ',
        offerType: 'DISCOUNT',
        couponId: 'SAVE20',
        rationale: 'Price-sensitive customers respond to a discount.',
      },
    })
    expect(result.isError).toBeFalsy()
    const p = result.structuredContent as Record<string, any>
    expect(p).toMatchObject({
      kind: 'offer-proposal',
      flow: { scope: 'segment', segmentId: 'seg_annual', name: 'Annual plans' },
      target: 'Survey answer "Too expensive"',
      before: { offerType: 'PAUSE', text: 'Pause for up to 1 month' },
      // the coupon is resolved from the step offer elsewhere in the draft
      after: { offerType: 'DISCOUNT', text: '20% off for 3 months (Save 20)' },
      change: {
        blueprintId: 'bp_annual_draft',
        stepGuid: 'step_survey',
        choiceGuid: 'c_price',
        offerType: 'DISCOUNT',
        config: { couponId: 'SAVE20', autoOptimize: false },
      },
      builderUrl: 'https://app.churnkey.co/builder/bp_annual_draft',
    })
    expect(requests.every((r) => r.method === 'GET')).toBe(true)
    await client.close()
  })

  it('targets the main offer step when no reason is given', async () => {
    const client = await connect()
    const result = await client.callTool({
      name: PROPOSE_TOOL,
      arguments: { segmentId: 'seg_annual', offerType: 'PAUSE', maxPauseLength: 3 },
    })
    const p = result.structuredContent as Record<string, any>
    expect(p.target).toBe('Main offer')
    expect(p.before.text).toBe('20% off for 3 months (Save 20)')
    expect(p.after.text).toBe('Pause for up to 3 months')
    expect(p.change).toEqual({
      blueprintId: 'bp_annual_draft',
      stepGuid: 'step_offer',
      offerType: 'PAUSE',
      config: { maxPauseLength: 3, pauseInterval: 'MONTH' },
    })
    await client.close()
  })

  it('lists the real answers when the reason does not match', async () => {
    const client = await connect()
    const result = await client.callTool({
      name: PROPOSE_TOOL,
      arguments: {
        segmentId: 'seg_annual',
        reason: 'Switching to a competitor',
        offerType: 'PAUSE',
        maxPauseLength: 2,
      },
    })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('\\"Too expensive\\", \\"Not using it enough\\"')
    await client.close()
  })

  it('refuses a discount without a coupon, and a flow without a draft', async () => {
    const client = await connect()
    const noCoupon = await client.callTool({
      name: PROPOSE_TOOL,
      arguments: { segmentId: 'seg_annual', offerType: 'DISCOUNT' },
    })
    expect(noCoupon.isError).toBe(true)
    const noDraft = await client.callTool({
      name: PROPOSE_TOOL,
      arguments: { segmentId: 'seg_new', offerType: 'PAUSE', maxPauseLength: 2 },
    })
    expect(noDraft.isError).toBe(true)
    expect(JSON.stringify(noDraft.content)).toContain('no draft')
    await client.close()
  })
})

describe('apply_offer_change', () => {
  it('is app-only and marked as a destructive, closed-world write', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    const tool = tools.find((t) => t.name === APPLY_TOOL)
    expect(tool?._meta).toEqual({ ui: { visibility: ['app'] } })
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: false })
    await client.close()
  })

  it('writes the draft offer through the Data API and never publishes', async () => {
    const client = await connect()
    const result = await client.callTool({
      name: APPLY_TOOL,
      arguments: {
        blueprintId: 'bp_annual_draft',
        stepGuid: 'step_survey',
        choiceGuid: 'c_price',
        offerType: 'DISCOUNT',
        config: { couponId: 'SAVE20', autoOptimize: false },
      },
    })
    expect(result.isError).toBeFalsy()
    expect(requests).toEqual([
      {
        method: 'POST',
        path: '/v1/data/blueprints/bp_annual_draft/offer',
        body: {
          stepGuid: 'step_survey',
          choiceGuid: 'c_price',
          offerType: 'DISCOUNT',
          config: { couponId: 'SAVE20', autoOptimize: false },
        },
      },
    ])
    expect(requests.some((r) => r.path.endsWith('/publish'))).toBe(false)
    await client.close()
  })

  it('rejects config fields outside the supported offer types', async () => {
    const client = await connect()
    const result = await client.callTool({
      name: APPLY_TOOL,
      arguments: {
        blueprintId: 'bp_annual_draft',
        stepGuid: 'step_offer',
        offerType: 'PAUSE',
        config: { maxPauseLength: 2, redirectUrl: 'https://example.com' },
      },
    })
    expect(result.isError).toBe(true)
    expect(requests).toEqual([])
    await client.close()
  })
})

describe('describeOffer', () => {
  it('describes each supported offer type in plain words', () => {
    expect(describeOffer({ offerType: 'DISCOUNT', discountConfig: { autoOptimize: true } }).text).toBe(
      'Adaptive discount (Churnkey picks it)',
    )
    expect(describeOffer({ offerType: 'DISCOUNT', discountConfig: { couponId: 'X1' } }).text).toBe('Coupon X1')
    expect(
      describeOffer({
        offerType: 'DISCOUNT',
        discountConfig: { coupon: { amountOff: 500, currency: 'usd', duration: 'forever' } },
      }).text,
    ).toBe('$5.00 off forever')
    expect(describeOffer({ offerType: 'PAUSE', pauseConfig: { maxPauseLength: 2, pauseInterval: 'WEEK' } }).text).toBe(
      'Pause for up to 2 weeks',
    )
    expect(describeOffer({ offerType: 'TRIAL_EXTENSION', trialExtensionConfig: { trialExtensionDays: 14 } }).text).toBe(
      'Extend the trial by 14 days',
    )
    expect(describeOffer({ offerType: 'PLAN_CHANGE' }).text).toBe('Plan change')
  })
})

describe('coupon names', () => {
  it('drops a coupon name that only repeats the amount', () => {
    const offer = (name: string) => ({
      offerType: 'DISCOUNT',
      discountConfig: { coupon: { name, percentOff: 50, duration: 'repeating', durationInMonths: 1 } },
    })
    expect(describeOffer(offer('50% off next month')).text).toBe('50% off for 1 month')
    expect(describeOffer(offer('Winback')).text).toBe('50% off for 1 month (Winback)')
  })
})
