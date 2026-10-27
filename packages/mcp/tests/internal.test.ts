import { createServer as createNodeServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BASELINE_SCOPES, CROSS_ORG_SCOPE, INTERNAL_SCOPES } from '../src/auth/oauth'
import { loadHttpRequestConfig, loadHttpServerConfig } from '../src/config'
import { startHttpServer } from '../src/http'

interface ApiCall {
  path: string
  authorization?: string
  targetOrg?: string
}

let mcp: Server | undefined
let api: Server | undefined
let apiCalls: ApiCall[] = []

async function start(env: Record<string, string> = {}) {
  mcp = await startHttpServer({ CHURNKEY_MCP_PORT: '0', CHURNKEY_MCP_HOST: '127.0.0.1', ...env })
  return `http://127.0.0.1:${(mcp.address() as AddressInfo).port}`
}

// Stub Churnkey API that records what each tool call sends.
async function startApi() {
  api = createNodeServer((req, res) => {
    apiCalls.push({
      path: req.url ?? '',
      authorization: req.headers.authorization,
      targetOrg: req.headers['x-ck-target-org'] as string | undefined,
    })
    res
      .writeHead(200, {
        'content-type': 'application/json',
        'x-churnkey-acting-org-id': 'grantorg',
        'x-churnkey-acting-org-name': 'Grant%20Org',
      })
      .end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((resolve) => api?.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(api.address() as AddressInfo).port}/v1`
}

async function rpc(url: string, token: string, method: string, params: unknown = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await res.text()
  const data = text
    .split('\n')
    .find((line) => line.startsWith('data: '))
    ?.slice(6)
  return { status: res.status, message: data ? JSON.parse(data) : undefined }
}

const SERVICE_KEY = `ck_sk_${'c'.repeat(64)}`
const STAFF_TOKEN = `ck_oat_${'d'.repeat(64)}`

beforeEach(() => {
  apiCalls = []
})

afterEach(async () => {
  for (const s of [mcp, api]) if (s) await new Promise((resolve) => s.close(resolve))
  mcp = undefined
  api = undefined
})

describe('internal endpoint switch', () => {
  it('is not served unless CHURNKEY_MCP_INTERNAL_PATH is set', async () => {
    const base = await start()
    const res = await rpc(`${base}/internal`, STAFF_TOKEN, 'tools/list')
    expect(res.status).toBe(404)
  })

  it('rejects an internal path that is relative or equal to the public one', () => {
    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_INTERNAL_PATH: 'internal' })).toThrow(/must start with \//)
    expect(() => loadHttpServerConfig({ CHURNKEY_MCP_INTERNAL_PATH: '/mcp' })).toThrow(/differ/)
  })
})

describe('internal endpoint OAuth discovery', () => {
  const env = { CHURNKEY_MCP_INTERNAL_PATH: '/internal', CHURNKEY_MCP_PUBLIC_URL: 'https://mcp.churnkey.co' }

  it('challenges with its own metadata and the cross-org scope', async () => {
    const base = await start(env)
    const res = await fetch(`${base}/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="https://mcp.churnkey.co/.well-known/oauth-protected-resource/internal", scope="${INTERNAL_SCOPES.join(' ')}"`,
    )
  })

  it('advertises the cross-org scope only on the internal metadata', async () => {
    const base = await start(env)
    const internal = (await (await fetch(`${base}/.well-known/oauth-protected-resource/internal`)).json()) as {
      scopes_supported: string[]
    }
    expect(internal.scopes_supported).toEqual(INTERNAL_SCOPES)
    expect(internal.scopes_supported).toContain(CROSS_ORG_SCOPE)

    const publicMeta = (await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json()) as {
      scopes_supported: string[]
    }
    expect(publicMeta.scopes_supported).toEqual(BASELINE_SCOPES)
  })

  it('refuses a Data API key', async () => {
    const base = await start(env)
    const res = await fetch(`${base}/internal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ck-app': 'app', 'x-ck-api-key': 'live_key' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(res.status).toBe(401)
    expect(await res.text()).toMatch(/staff sign-in or service key/)
  })
})

describe('internal endpoint tools', () => {
  async function setup() {
    const apiUrl = await startApi()
    const base = await start({ CHURNKEY_MCP_INTERNAL_PATH: '/internal', CHURNKEY_API_URL: apiUrl })
    return base
  }

  it('every tool except find_org requires org; customer-facing apps are absent', async () => {
    const base = await setup()
    const { message } = await rpc(`${base}/internal`, SERVICE_KEY, 'tools/list')
    const tools = message.result.tools as Array<{ name: string; inputSchema: { required?: string[] } }>
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))

    expect(byName.find_org).toBeDefined()
    expect(byName.find_org.inputSchema.required ?? []).not.toContain('org')
    expect(byName.open_retention_dashboard).toBeUndefined()
    for (const tool of tools.filter((t) => t.name !== 'find_org')) {
      expect(tool.inputSchema.required ?? [], tool.name).toContain('org')
    }
  })

  it('sends the org of each call as x-ck-target-org with the caller bearer', async () => {
    const base = await setup()
    const first = await rpc(`${base}/internal`, SERVICE_KEY, 'tools/call', {
      name: 'get_account',
      arguments: { org: 'appone123' },
    })
    const second = await rpc(`${base}/internal`, STAFF_TOKEN, 'tools/call', {
      name: 'get_account',
      arguments: { org: 'apptwo456' },
    })
    expect(first.message.result.isError).toBeUndefined()
    expect(second.message.result.isError).toBeUndefined()
    expect(apiCalls).toEqual([
      { path: '/v1/data/account', authorization: `Bearer ${SERVICE_KEY}`, targetOrg: 'appone123' },
      { path: '/v1/data/account', authorization: `Bearer ${STAFF_TOKEN}`, targetOrg: 'apptwo456' },
    ])
  })

  it('never calls the API when org is missing', async () => {
    const base = await setup()
    const { message } = await rpc(`${base}/internal`, SERVICE_KEY, 'tools/call', { name: 'get_account', arguments: {} })
    expect(message.result?.isError ?? Boolean(message.error)).toBe(true)
    expect(apiCalls).toEqual([])
  })

  it('find_org searches without a target workspace', async () => {
    const base = await setup()
    await rpc(`${base}/internal`, SERVICE_KEY, 'tools/call', { name: 'find_org', arguments: { query: 'Acme Inc' } })
    expect(apiCalls).toEqual([
      { path: '/v1/data/internal/orgs?query=Acme+Inc', authorization: `Bearer ${SERVICE_KEY}`, targetOrg: undefined },
    ])
  })

  it('find_org results carry no acting-workspace line; tools with org do', async () => {
    const base = await setup()
    const texts = async (name: string, args: Record<string, string>) => {
      const { message } = await rpc(`${base}/internal`, STAFF_TOKEN, 'tools/call', { name, arguments: args })
      return (message.result.content as Array<{ text: string }>).map((c) => c.text)
    }
    expect((await texts('find_org', { query: 'Acme' })).some((t) => t.startsWith('Acting on workspace'))).toBe(false)
    expect(await texts('get_account', { org: 'appone123' })).toContain('Acting on workspace: Grant Org (org grantorg).')
  })

  it('the public endpoint is unchanged: no org input, no find_org, no target header', async () => {
    const base = await setup()
    const { message } = await rpc(`${base}/mcp`, STAFF_TOKEN, 'tools/list')
    const tools = message.result.tools as Array<{ name: string; inputSchema: { properties?: Record<string, unknown> } }>
    expect(tools.some((t) => t.name === 'find_org')).toBe(false)
    expect(tools.some((t) => t.inputSchema.properties && 'org' in t.inputSchema.properties)).toBe(false)

    await rpc(`${base}/mcp`, STAFF_TOKEN, 'tools/call', { name: 'get_account', arguments: { org: 'appone123' } })
    expect(apiCalls.map((c) => c.targetOrg)).toEqual([undefined])
  })
})

describe('service keys on the hosted transport', () => {
  it('a ck_sk_ bearer is passed through as a bearer, not read as a Data API key', () => {
    const headers = new Headers({ authorization: `Bearer ${SERVICE_KEY}` })
    expect(loadHttpRequestConfig(headers, {}).auth).toEqual({ kind: 'bearer', token: SERVICE_KEY })
  })
})
