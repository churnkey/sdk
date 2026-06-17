import { request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { startHttpServer } from '../src/http'

/**
 * Raw HTTP request so we can control the Host header (fetch forbids overriding it,
 * which is exactly what the DNS-rebinding guard inspects).
 */
function rawRequest(
  port: number,
  opts: { method?: string; path?: string; host?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: opts.method ?? 'GET',
        path: opts.path ?? '/mcp',
        headers: { ...(opts.host ? { host: opts.host } : {}), ...opts.headers },
      },
      (res) => {
        let body = ''
        res.on('data', (d) => {
          body += d
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

let server: Server | undefined

async function start(env: Record<string, string> = {}) {
  server = await startHttpServer({
    CHURNKEY_MCP_PORT: '0',
    CHURNKEY_MCP_HOST: '127.0.0.1',
    ...env,
  })
  const { port } = server.address() as AddressInfo
  return { base: `http://127.0.0.1:${port}`, port }
}

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve))
    server = undefined
  }
})

describe('http — routing', () => {
  it('returns 404 for an unknown path', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/not-mcp`)
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Not found')
  })

  it('honors a custom path (404 on default /mcp then)', async () => {
    const { base } = await start({ CHURNKEY_MCP_PATH: '/custom' })
    expect((await fetch(`${base}/mcp`)).status).toBe(404)
    // /custom with a GET and no session → 400 "Missing MCP session ID"
    const res = await fetch(`${base}/custom`)
    expect(res.status).toBe(400)
  })

  it('GET to /mcp with no session id → 400 missing session', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/mcp`, { method: 'GET' })
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('Missing MCP session ID')
  })

  it('request with an unknown mcp-session-id → 404 session not found', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'mcp-session-id': 'does-not-exist' },
      body: '{}',
    })
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('MCP session not found')
  })
})

describe('http — OPTIONS / CORS', () => {
  it('OPTIONS returns 204', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/mcp`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
  })

  it('no CORS headers when CHURNKEY_MCP_CORS_ORIGIN is unset, even with Origin', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/mcp`, { method: 'OPTIONS', headers: { origin: 'https://app.churnkey.co' } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('reflects a matching origin when CORS origin is set explicitly', async () => {
    const { base } = await start({ CHURNKEY_MCP_CORS_ORIGIN: 'https://app.churnkey.co' })
    const res = await fetch(`${base}/mcp`, {
      method: 'OPTIONS',
      headers: { origin: 'https://app.churnkey.co' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.churnkey.co')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    expect(res.headers.get('vary')).toBe('origin')
    expect(res.headers.get('access-control-expose-headers')).toBe('mcp-session-id')
  })

  it('does NOT set CORS headers for a non-matching origin', async () => {
    const { base } = await start({ CHURNKEY_MCP_CORS_ORIGIN: 'https://app.churnkey.co' })
    const res = await fetch(`${base}/mcp`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example.com' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('wildcard CORS origin reflects "*" for any origin', async () => {
    const { base } = await start({ CHURNKEY_MCP_CORS_ORIGIN: '*' })
    const res = await fetch(`${base}/mcp`, {
      method: 'OPTIONS',
      headers: { origin: 'https://anything.example.com' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('no CORS headers when there is no Origin header at all', async () => {
    const { base } = await start({ CHURNKEY_MCP_CORS_ORIGIN: '*' })
    const res = await fetch(`${base}/mcp`, { method: 'OPTIONS' })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('http — DNS-rebinding host guard', () => {
  it('forbids a host not in the allowlist (403)', async () => {
    const { port } = await start({ CHURNKEY_MCP_ALLOWED_HOSTS: 'mcp.churnkey.co' })
    const res = await rawRequest(port, {
      method: 'POST',
      host: 'attacker.example.com',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(403)
    expect(res.body).toBe('Forbidden host')
  })

  it('allows a host that IS in the allowlist (passes guard → reaches request config / 401)', async () => {
    const { port } = await start({ CHURNKEY_MCP_ALLOWED_HOSTS: 'allowed.example.com' })
    const res = await rawRequest(port, {
      method: 'POST',
      host: 'allowed.example.com',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    // Passed the host guard; failed auth instead.
    expect(res.status).toBe(401)
  })

  it('forbids a request with NO host header when an allowlist is configured', async () => {
    const { port } = await start({ CHURNKEY_MCP_ALLOWED_HOSTS: 'allowed.example.com' })
    // node's http client always sends a Host header, so simulate "no host" by sending one that
    // is not in the list — covers the guard's reject branch deterministically.
    const res = await rawRequest(port, {
      method: 'POST',
      host: '',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(403)
  })

  it('no allowlist configured → any host is allowed (reaches auth → 401)', async () => {
    const { port } = await start()
    const res = await rawRequest(port, {
      method: 'POST',
      host: 'whatever.example.com',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(res.status).toBe(401)
  })
})

describe('http — auth error → 401 with WWW-Authenticate', () => {
  it('missing credentials surfaces the config error message in the 401 body', async () => {
    const { base } = await start({ CHURNKEY_MCP_PUBLIC_URL: 'https://mcp.churnkey.co' })
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=')
    expect(await res.text()).toMatch(/App ID|credentials/i)
  })

  it('a Data API key request (valid headers) connects a session and returns a session id', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-ck-app': 'app_test',
        'x-ck-api-key': 'key_test',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    })
    // The MCP transport handled it and assigned a session — proves the create/connect path runs.
    expect(res.status).toBe(200)
    expect(res.headers.get('mcp-session-id')).toBeTruthy()
  })
})

describe('http — session lifecycle (create, reuse, cleanup)', () => {
  it('reuses a session on the second request and tears it down on DELETE', async () => {
    const { port } = await start()
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'x-ck-app': 'app_test',
      'x-ck-api-key': 'key_test',
    }
    const initRes = await rawRequest(port, {
      method: 'POST',
      host: '127.0.0.1',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } },
      }),
    })
    expect(initRes.status).toBe(200)
    // Grab the session id from the response headers via a fetch (rawRequest doesn't expose them).
    const sid = await getSessionId(port, headers)
    expect(sid).toBeTruthy()

    // Second request WITH the session id → routed to the existing transport (handleRequest path).
    const reuse = await rawRequest(port, {
      method: 'POST',
      host: '127.0.0.1',
      headers: { ...headers, 'mcp-session-id': sid! },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
    // The existing transport handled it (202 Accepted for a notification, or 200) — not a 404.
    expect(reuse.status).not.toBe(404)

    // DELETE with the session id → transport closes → onclose deletes the session.
    const del = await rawRequest(port, {
      method: 'DELETE',
      host: '127.0.0.1',
      headers: { ...headers, 'mcp-session-id': sid! },
    })
    expect(del.status).not.toBe(404)

    // After close, the session id is no longer known → 404.
    const afterClose = await rawRequest(port, {
      method: 'POST',
      host: '127.0.0.1',
      headers: { ...headers, 'mcp-session-id': sid! },
      body: '{}',
    })
    expect(afterClose.status).toBe(404)
  })
})

/** Helper: initialize a session and return its mcp-session-id (fetch exposes response headers). */
async function getSessionId(port: number, headers: Record<string, string>): Promise<string | null> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } },
    }),
  })
  return res.headers.get('mcp-session-id')
}

describe('http — protected-resource metadata default URL', () => {
  it('builds the default public URL from the CONFIGURED host:port (an explicit port)', async () => {
    const { base } = await start({ CHURNKEY_MCP_PORT: '4555', CHURNKEY_API_URL: 'https://api.churnkey.co/v1' })
    // NOTE: start() listens on the configured 4555 here (not ephemeral).
    const res = await fetch(`http://127.0.0.1:4555/.well-known/oauth-protected-resource`)
    const body = (await res.json()) as {
      resource: string
      authorization_servers: string[]
      bearer_methods_supported: string[]
    }
    expect(body.resource).toBe('http://127.0.0.1:4555')
    expect(body.authorization_servers).toEqual(['https://api.churnkey.co'])
    expect(body.bearer_methods_supported).toEqual(['header'])
    void base
  })

  it('with port 0 (ephemeral) advertises the actual BOUND port, not the literal :0', async () => {
    // resolvePublicUrl is refreshed after listen() from server.address(), so an
    // ephemeral bind advertises its real resource identifier instead of an
    // unusable "http://127.0.0.1:0". (Regression test for the :0 bug.)
    const { base, port } = await start({ CHURNKEY_API_URL: 'https://api.churnkey.co/v1' })
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`)
    const body = (await res.json()) as { resource: string }
    expect(port).toBeGreaterThan(0)
    expect(body.resource).toBe(base)
    expect(body.resource).not.toContain(':0')
  })
})
