import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { BASELINE_SCOPES } from '../src/auth/oauth'
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
    expect(res.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://mcp.churnkey.co/.well-known/oauth-protected-resource"',
    )
  })

  // The two places a client can learn what to ask for. Both have to name the
  // baseline, because clients read one or the other depending on whether they
  // follow the challenge or the metadata document — and whichever they read
  // decides what the user is asked to approve on first connect.
  it('asks for the read-only baseline in the challenge, not the whole catalog', async () => {
    const base = await start({ CHURNKEY_MCP_PUBLIC_URL: 'https://mcp.churnkey.co' })
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    const challenge = res.headers.get('www-authenticate') ?? ''
    const scope = /scope="([^"]+)"/.exec(challenge)?.[1] ?? ''

    expect(scope).toContain('cancel_flows.sessions.read')
    expect(scope).not.toContain('.write')
    expect(scope).not.toContain('read_pii')
    expect(scope).not.toContain('dsr.')
  })

  it('advertises the same baseline in scopes_supported', async () => {
    const base = await start()
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`)
    const { scopes_supported } = (await res.json()) as { scopes_supported: string[] }

    expect(scopes_supported).toEqual(BASELINE_SCOPES)
    expect(scopes_supported.some((s) => s.endsWith('.write'))).toBe(false)
    expect(scopes_supported.some((s) => s.endsWith('read_pii'))).toBe(false)
  })
})

describe('OpenAI domain verification', () => {
  it('serves the token verbatim, without auth', async () => {
    const base = await start({ CHURNKEY_MCP_OPENAI_CHALLENGE_TOKEN: 'openai-challenge-abc123' })
    const res = await fetch(`${base}/.well-known/openai-apps-challenge`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('openai-challenge-abc123')
  })

  it('404s when no token is configured', async () => {
    const base = await start()
    const res = await fetch(`${base}/.well-known/openai-apps-challenge`)
    expect(res.status).toBe(404)
  })

  // Their reviewer arrives from OpenAI's egress, not through whatever Host the
  // allowlist was written for, so gating this on it would fail verification.
  it('answers regardless of the host allowlist', async () => {
    const base = await start({
      CHURNKEY_MCP_OPENAI_CHALLENGE_TOKEN: 'tok',
      CHURNKEY_MCP_ALLOWED_HOSTS: 'mcp.churnkey.co',
    })
    const res = await fetch(`${base}/.well-known/openai-apps-challenge`)
    expect(res.status).toBe(200)
  })
})
