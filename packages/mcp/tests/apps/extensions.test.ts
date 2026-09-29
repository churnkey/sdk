import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DASHBOARD_TOOL, DASHBOARD_URI, loadDashboard, MCP_APP_MIME_TYPE, shareBase } from '../../src/apps/dashboard'
import { MENTIONS_TOOL } from '../../src/apps/mentions'
import type { ChurnkeyClient } from '../../src/client'
import { createServer } from '../../src/server'

// These drive the MCP Apps / OpenAI plugin-extension surface through a real
// client handshake, because what ChatGPT reads is the wire shape (`_meta`
// on tools/list and resources/read), not our internals.

const config = {
  baseUrl: 'https://api.example.com/v1',
  auth: { kind: 'data-api-key' as const, appId: 'a', apiKey: 'k' },
}

const segments = [
  { id: 'seg_annual', name: 'Annual plans', enabled: true, priority: 0, filter: [], activeBlueprint: 'bp1' },
  { id: 'seg_new', name: 'New monthly', enabled: true, priority: 1, filter: [], activeBlueprint: 'bp2' },
  { id: 'seg_old', name: 'Legacy pricing', enabled: false, priority: 2, filter: [], activeBlueprint: null },
]

const flowMetrics = {
  totalSessions: 100,
  customersSaved: 40,
  saveRate: 0.4,
  boostedRevenueUSD: 1234.5,
  averageBoostedRevenueUSD: 30.86,
  sessionOutcomes: { saved: { total: 40, byOfferType: { PAUSE: 25, DISCOUNT: 15 } }, canceled: 50, abandoned: 10 },
  sampleSizeWarning: null,
  summary: 'all cancel flows: 100 sessions, 40 customers saved (40% save rate).',
}

function route(path: string, query: URLSearchParams): unknown {
  switch (path) {
    case '/v1/data/account':
      return { org: { id: 'org1', name: 'Northwind' }, mode: 'LIVE' }
    case '/v1/data/flow-metrics':
      return flowMetrics
    case '/v1/data/segments':
      return segments
    case '/v1/data/ab-tests':
      return [{ id: 'ab1', name: 'Annual pause vs discount', state: 'tracking' }]
    case '/v1/data/warehouse/session-aggregation':
      if (query.get('breakdown') === 'month-saveType') {
        return [
          { month: '2026-08', saveType: 'PAUSE', count: 10 },
          { month: '2026-07', saveType: null, count: 20 },
          { month: '2026-08', saveType: 'ABANDON', count: 5 },
          { month: '2026-07', saveType: 'DISCOUNT', count: '7' },
        ]
      }
      return [
        { segmentId: 'seg_new', saveType: 'PAUSE', count: 30 },
        { segmentId: 'seg_new', saveType: null, count: 50 },
        { segmentId: 'seg_annual', saveType: 'DISCOUNT', count: 9 },
        { segmentId: 'seg_annual', saveType: 'ABANDON', count: 1 },
        { segmentId: null, saveType: null, count: 99 },
      ]
    default:
      return undefined
  }
}

async function fakeApi(input: URL | string): Promise<Response> {
  const url = new URL(String(input))
  const body = route(url.pathname, url.searchParams)
  if (body === undefined) return new Response('Not found', { status: 404 })
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const fetchMock = vi.fn(fakeApi)

async function connect() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' }, { capabilities: {} })
  await Promise.all([createServer(config).connect(serverSide), client.connect(clientSide)])
  return client
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(fakeApi)
  vi.unstubAllGlobals()
})

describe('Retention Dashboard MCP App', () => {
  it('advertises the UI resource and the sidebar + thread entrypoints on tools/list', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    const tool = tools.find((t) => t.name === DASHBOARD_TOOL)

    expect(tool?.title).toBe('Retention Dashboard')
    expect(tool?.annotations?.readOnlyHint).toBe(true)
    expect(tool?._meta).toMatchObject({
      ui: { resourceUri: DASHBOARD_URI },
      'ui/resourceUri': DASHBOARD_URI,
      'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] },
    })
    // Entrypoints open with `{}`, so nothing may be required.
    expect(tool?.inputSchema.required ?? []).toEqual([])
    await client.close()
  })

  it('serves the app as an MCP App resource with display-mode hints and a closed CSP', async () => {
    const client = await connect()
    const { resources } = await client.listResources()
    expect(resources.find((r) => r.uri === DASHBOARD_URI)?.mimeType).toBe(MCP_APP_MIME_TYPE)

    const { contents } = await client.readResource({ uri: DASHBOARD_URI })
    expect(contents[0]).toMatchObject({
      uri: DASHBOARD_URI,
      mimeType: MCP_APP_MIME_TYPE,
      _meta: {
        ui: { csp: { connectDomains: [], resourceDomains: [] } },
        'openai/ui': { preferredDisplayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] },
      },
    })
    expect(String((contents[0] as { text?: string }).text)).toMatch(/^<!doctype html>/i)
    await client.close()
  })

  it('opens with {} and returns structuredContent plus a text summary', async () => {
    const client = await connect()
    const result = await client.callTool({ name: DASHBOARD_TOOL, arguments: {} })
    expect(result.isError).toBeFalsy()

    const data = result.structuredContent as Record<string, any>
    expect(data.org).toEqual({ id: 'org1', name: 'Northwind' })
    expect(data.window).toBe('90d')
    expect(data.metrics.saveRate).toBe(0.4)
    const text = (result.content as Array<{ text: string }>)[0].text
    expect(text).toContain('Northwind')
    expect(text).toContain('Annual plans')
    await client.close()
  })

  it('surfaces an API failure as a tool error rather than a transport error', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('boom', { status: 500 }))
    fetchMock.mockImplementationOnce(async () => new Response('Warehouse unavailable', { status: 500 }))
    const client = await connect()
    const result = await client.callTool({ name: DASHBOARD_TOOL, arguments: {} })
    expect(result.isError).toBe(true)
    await client.close()
  })
})

describe('loadDashboard', () => {
  function stubClient(): ChurnkeyClient {
    return {
      mode: 'live',
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        const query = new URLSearchParams()
        for (const [k, v] of Object.entries(options?.query ?? {})) if (v != null) query.set(k, String(v))
        return route(`/v1${path}`, query)
      }),
    } as unknown as ChurnkeyClient
  }

  it('buckets warehouse rows the way flow-metrics does (null = canceled, ABANDON = abandoned)', async () => {
    const data = await loadDashboard(stubClient(), {}, new Date('2026-09-29T12:00:00Z'))

    expect(data.trend).toEqual([
      { month: '2026-07', saved: 7, canceled: 20, abandoned: 0 },
      { month: '2026-08', saved: 10, canceled: 0, abandoned: 5 },
    ])
    const newMonthly = data.segments.find((s) => s.id === 'seg_new')
    expect(newMonthly).toMatchObject({ total: 80, saved: 30, canceled: 50, abandoned: 0, saveRate: 30 / 80 })
  })

  it('orders segments by volume, keeps zero-traffic segments, and ignores unsegmented rows', async () => {
    const data = await loadDashboard(stubClient(), {}, new Date('2026-09-29T12:00:00Z'))
    expect(data.segments.map((s) => s.id)).toEqual(['seg_new', 'seg_annual', 'seg_old'])
    expect(data.segments.find((s) => s.id === 'seg_old')).toMatchObject({ total: 0, saveRate: null })
  })

  it('windows every query to the same date range and scopes the headline to the segment', async () => {
    const client = stubClient()
    const data = await loadDashboard(client, { window: '30d', segmentId: 'seg_new' }, new Date('2026-09-29T12:00:00Z'))
    expect(data).toMatchObject({ startDate: '2026-08-30', endDate: '2026-09-29', segmentId: 'seg_new' })

    const calls = (client.get as ReturnType<typeof vi.fn>).mock.calls
    const flow = calls.find(([p]) => p === '/data/flow-metrics')
    expect(flow?.[1].query).toMatchObject({ startDate: '2026-08-30', endDate: '2026-09-29', segmentId: 'seg_new' })
    const aggregations = calls.filter(([p]) => p === '/data/warehouse/session-aggregation')
    expect(aggregations.map(([, o]) => o.query.breakdown).sort()).toEqual(['month-saveType', 'segmentId-saveType'])
    for (const [, o] of aggregations) expect(o.query.startDate).toBe('2026-08-30')
    // The trend follows the selected segment; the segment table never does.
    expect(aggregations.find(([, o]) => o.query.breakdown === 'month-saveType')?.[1].query.segmentId).toBe('seg_new')
    expect(
      aggregations.find(([, o]) => o.query.breakdown === 'segmentId-saveType')?.[1].query.segmentId,
    ).toBeUndefined()
  })
})

describe('trend window edges', () => {
  function stubClient(): ChurnkeyClient {
    return {
      mode: 'live',
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        const query = new URLSearchParams()
        for (const [k, v] of Object.entries(options?.query ?? {})) if (v != null) query.set(k, String(v))
        return route(`/v1${path}`, query)
      }),
    } as unknown as ChurnkeyClient
  }

  it('starts 12 months on a calendar month so the trend has no stub bar', async () => {
    const client = stubClient()
    const data = await loadDashboard(client, { window: '12m' }, new Date('2026-09-29T12:00:00Z'))
    expect(data.startDate).toBe('2025-10-01')
  })

  it('drops a leading trend month with under a week of data, and keeps the rest', async () => {
    // 30 days back from 2026-09-29 is 2026-08-30, so August holds two days of data.
    const client = {
      mode: 'live',
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) =>
        path === '/data/warehouse/session-aggregation' && options?.query?.breakdown === 'month-saveType'
          ? [
              { month: '2026-08', saveType: 'PAUSE', count: 3 },
              { month: '2026-09', saveType: 'PAUSE', count: 40 },
              { month: '2026-09', saveType: null, count: 60 },
            ]
          : route(`/v1${path}`, new URLSearchParams()),
      ),
    } as unknown as ChurnkeyClient
    const data = await loadDashboard(client, { window: '30d' }, new Date('2026-09-29T12:00:00Z'))
    expect(data.trend).toEqual([{ month: '2026-09', saved: 40, canceled: 60, abandoned: 0 }])
    // A window that opens on the 1st keeps its first month.
    const wide = await loadDashboard(stubClient(), { window: '90d' }, new Date('2026-09-29T12:00:00Z'))
    expect(wide.trend.map((r) => r.month)).toEqual(['2026-07', '2026-08'])
  })
})

describe('share links', () => {
  it('offers no share link until the ChatGPT plugin id is configured', () => {
    expect(shareBase({})).toBeNull()
    expect(shareBase({ CHURNKEY_MCP_CHATGPT_PLUGIN_ID: '  ' })).toBeNull()
  })

  it('builds the ChatGPT web deep-link base for the dashboard tool', () => {
    expect(shareBase({ CHURNKEY_MCP_CHATGPT_PLUGIN_ID: 'plugin_asdk_app_123' })).toBe(
      'https://chatgpt.com/plugins/plugin_asdk_app_123/app/open_retention_dashboard',
    )
  })

  it('carries the share base in the tool result', async () => {
    const client = await connect()
    const result = await client.callTool({ name: DASHBOARD_TOOL, arguments: {} })
    expect((result.structuredContent as { shareBase: unknown }).shareBase).toBeNull()
    await client.close()
  })
})

describe('composer at-mentions', () => {
  it('registers an app-only mention search tool', async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    const tool = tools.find((t) => t.name === MENTIONS_TOOL)
    expect(tool?._meta).toEqual({ 'openai/extensions': { 'mentions/search': {} }, ui: { visibility: ['app'] } })
    await client.close()
  })

  it('returns resource links for matching segments and A/B tests', async () => {
    const client = await connect()
    const result = await client.callTool({ name: MENTIONS_TOOL, arguments: { query: 'annual' } })
    const { items } = result.structuredContent as { items: Array<Record<string, string>> }

    expect(items.map((i) => i.uri)).toEqual(['churnkey://segments/seg_annual', 'churnkey://ab-tests/ab1'])
    expect(items[0]).toMatchObject({ type: 'resource_link', name: 'Annual plans', mimeType: 'application/json' })
    expect(items[0].description).toContain('priority 1')
    await client.close()
  })

  it('lists everything for an empty query', async () => {
    const client = await connect()
    const result = await client.callTool({ name: MENTIONS_TOOL, arguments: { query: '' } })
    expect((result.structuredContent as { items: unknown[] }).items).toHaveLength(4)
    await client.close()
  })

  it('still offers segments when the A/B test list is forbidden', async () => {
    fetchMock.mockImplementation(async (input: URL | string) => {
      const url = new URL(String(input))
      if (url.pathname === '/v1/data/ab-tests') return new Response('Missing required scope: x', { status: 403 })
      return fakeApi(input)
    })
    const client = await connect()
    const result = await client.callTool({ name: MENTIONS_TOOL, arguments: { query: '' } })
    expect((result.structuredContent as { items: unknown[] }).items).toHaveLength(3)
    await client.close()
  })

  it('resolves a mentioned churnkey:// link to the entity', async () => {
    const client = await connect()
    const { contents } = await client.readResource({ uri: 'churnkey://segments/seg_annual' })
    const entity = JSON.parse(String((contents[0] as { text: string }).text))
    expect(entity).toMatchObject({ kind: 'segment', id: 'seg_annual', name: 'Annual plans' })
    await client.close()
  })

  it('does not report an auth failure as "not found" when resolving a link', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('Missing required scope: segments', { status: 403 }))
    const client = await connect()
    await expect(client.readResource({ uri: 'churnkey://segments/seg_annual' })).rejects.toThrow(
      /Missing required scope/,
    )
    await client.close()
  })
})

describe('server icon', () => {
  it('sends a monochrome currentColor SVG icon in initialize', async () => {
    const client = await connect()
    const [icon] = client.getServerVersion()?.icons ?? []
    expect(icon?.mimeType).toBe('image/svg+xml')
    expect(decodeURIComponent(String(icon?.src))).toContain('stroke="currentColor"')
    await client.close()
  })
})
