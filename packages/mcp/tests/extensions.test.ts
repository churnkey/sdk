import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from '../src/server'
import { FLOW_EXPLORER_URI } from '../src/ui/server'

const flow = {
  flowId: 'org',
  scope: 'org',
  name: 'Default cancel flow',
  status: 'active',
  published: true,
  hasUnpublishedChanges: true,
  editableBlueprintId: 'draft1',
  publishedBlueprintId: 'pub1',
}
const config = { baseUrl: 'https://example.test/v1', auth: { kind: 'bearer' as const, token: 'synthetic-token' } }
const clients: Client[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(clients.splice(0).map((client) => client.close()))
})
async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'extension-test', version: '1' })
  clients.push(client)
  await Promise.all([createServer(config).connect(serverTransport), client.connect(clientTransport)])
  return client
}
function fakeApi(flows = [flow]) {
  return vi.fn(async (url: URL, options: RequestInit) => {
    expect(options.method).toBe('GET')
    expect((options.headers as Record<string, string>).authorization).toBe('Bearer synthetic-token')
    const payload = url.pathname.endsWith('/account')
      ? { org: { id: 'org_1', name: 'Example' }, mode: 'TEST', user: { email: 'private@example.test' } }
      : { flows }
    return new Response(JSON.stringify(payload), { status: 200 })
  })
}
describe('OpenAI Flow Explorer over MCP', () => {
  it('advertises sidebar and thread entrypoints and serves an offline HTML resource', async () => {
    const client = await connect()
    const tools = await client.listTools()
    const open = tools.tools.find((tool) => tool.name === 'open_flow_explorer')!
    expect(open._meta?.['openai/ui']).toEqual({ entrypoints: [{ type: 'global' }, { type: 'thread' }] })
    expect(open._meta?.ui).toMatchObject({ resourceUri: FLOW_EXPLORER_URI })
    expect(open.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    const resource = await client.readResource({ uri: FLOW_EXPLORER_URI })
    expect(resource.contents[0]).toMatchObject({
      mimeType: 'text/html;profile=mcp-app',
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } },
    })
    expect(resource.contents[0].text).toContain('Flow Explorer')
  })
  it('accepts empty entrypoint input, orients first, preserves status, and omits user PII', async () => {
    const fetch = fakeApi()
    vi.stubGlobal('fetch', fetch)
    const client = await connect()
    const result = await client.callTool({ name: 'open_flow_explorer', arguments: {} })
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toEqual({
      workspace: { id: 'org_1', name: 'Example' },
      sessionMode: 'TEST',
      metricsMode: 'live',
      flows: [flow],
    })
    expect(JSON.stringify(result)).not.toContain('private@example.test')
    expect(fetch.mock.calls.map(([url]) => url.pathname)).toEqual(['/v1/data/account', '/v1/data/blueprints'])
  })
  it('fails closed on auth/scope errors without returning old inventory', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'Access to this workspace is not permitted.' }), { status: 403 }),
      )
    vi.stubGlobal('fetch', fetch)
    const client = await connect()
    const result = await client.callTool({ name: 'open_flow_explorer', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('searches flow mentions and resolves only resources in the current workspace', async () => {
    vi.stubGlobal('fetch', fakeApi())
    const client = await connect()
    const result = await client.callTool({ name: 'search_mentions', arguments: { query: ' DEFAULT ' } })
    expect(result.structuredContent).toEqual({
      items: [
        {
          type: 'resource',
          resourceUri: 'churnkey://flows/org',
          title: flow.name,
          subtitle: 'active · unpublished changes',
        },
      ],
    })
    const resource = await client.readResource({ uri: 'churnkey://flows/org' })
    const data = JSON.parse(resource.contents[0].text as string)
    expect(data.metricsScope).toEqual({ blueprintId: 'pub1' })
    await expect(client.readResource({ uri: 'churnkey://flows/other-workspace-id' })).rejects.toThrow('unavailable')
    vi.stubGlobal('fetch', fakeApi([]))
    await expect(client.readResource({ uri: 'churnkey://flows/org' })).rejects.toThrow('unavailable')
  })
  it('bounds mention results, supports empty queries, and never caches another token’s inventory', async () => {
    vi.stubGlobal('fetch', fakeApi(Array.from({ length: 35 }, (_, i) => ({ ...flow, flowId: String(i) }))))
    const first = await connect()
    const result = await first.callTool({ name: 'search_mentions', arguments: { query: '' } })
    expect((result.structuredContent as { items: unknown[] }).items).toHaveLength(20)
    vi.stubGlobal('fetch', fakeApi([]))
    const second = await connect()
    expect((await second.callTool({ name: 'search_mentions', arguments: { query: '' } })).structuredContent).toEqual({
      items: [],
    })
  })
})
