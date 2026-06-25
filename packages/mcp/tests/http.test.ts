import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { startHttpServer } from '../src/http'

let server: Server | undefined

async function start(env: Record<string, string> = {}) {
  server = await startHttpServer({
    CHURNKEY_MCP_PORT: '0',
    CHURNKEY_MCP_HOST: '127.0.0.1',
    ...env,
  })
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve))
    server = undefined
  }
})

describe('HTTP transport OAuth discovery', () => {
  it('serves RFC 9728 protected-resource metadata pointing at the API authorization server', async () => {
    const base = await start({
      CHURNKEY_MCP_PUBLIC_URL: 'https://mcp.churnkey.co',
      CHURNKEY_API_URL: 'https://api.churnkey.co/v1',
    })
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { resource: string; authorization_servers: string[] }
    expect(body.resource).toBe('https://mcp.churnkey.co')
    expect(body.authorization_servers).toEqual(['https://api.churnkey.co'])
  })

  it('returns WWW-Authenticate with the resource metadata URL on unauthenticated requests', async () => {
    const base = await start({ CHURNKEY_MCP_PUBLIC_URL: 'https://mcp.churnkey.co' })
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://mcp.churnkey.co/.well-known/oauth-protected-resource"',
    )
  })
})
