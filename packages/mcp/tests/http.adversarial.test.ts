import { createServer as createNodeServer, request as httpRequest, type Server } from 'node:http'
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
    // /custom with a GET and no session → 405 (transport probe, not a stream)
    const res = await fetch(`${base}/custom`)
    expect(res.status).toBe(405)
  })

  it('GET to /mcp → 405 Method Not Allowed + Allow: POST', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/mcp`, { method: 'GET' })
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
    expect(await res.text()).toBe('Method Not Allowed')
  })

  it('ignores an unrecognized mcp-session-id instead of 404ing (stateless: clients that connected before the change keep working)', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-ck-app': 'app_test',
        'x-ck-api-key': 'key_test',
        'mcp-session-id': 'session-from-a-previous-deploy',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(200)
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
    expect(res.headers.get('access-control-expose-headers')).toBe(
      'mcp-session-id, mcp-protocol-version, www-authenticate',
    )
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

  it('a Data API key request (valid headers) reaches the MCP transport', async () => {
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
    // The transport handled it — proves the create/connect path runs.
    expect(res.status).toBe(200)
    // Stateless: no session is minted, so no session id comes back.
    expect(res.headers.get('mcp-session-id')).toBeNull()
  })

  it('a non-auth failure answers 500, NOT 401 — a 401 would make an OAuth client discard a good token', async () => {
    const { base } = await start()
    // A body that is not valid JSON fails inside the transport, well past the
    // credential check. Before this was narrowed, every such failure came back
    // as 401 + WWW-Authenticate.
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-ck-app': 'app_test',
        'x-ck-api-key': 'key_test',
      },
      body: 'not json at all',
    })
    expect(res.status).not.toBe(401)
    expect(res.headers.get('www-authenticate')).toBeNull()
  })
})

describe('http — the bearer token is read from every request', () => {
  /**
   * The regression guard for XDEV-2487.
   *
   * A hosted OAuth access token lives one hour. MCP clients refresh it and send
   * the new one on subsequent requests. When the transport was stateful, the
   * token captured on `initialize` was reused for the life of the session, so
   * every hosted connector broke exactly one hour after connecting and stayed
   * broken until the user re-authorized by hand.
   *
   * Asserted against a stub API that records the Authorization header it is
   * handed, because the only thing that actually matters is which token reaches
   * Churnkey — not what the transport was told.
   */
  it('forwards the token from the CURRENT request, not the one that opened the connection', async () => {
    const received: string[] = []
    const api = createNodeServer((req, res) => {
      received.push(req.headers.authorization ?? '(none)')
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
    const apiPort = (api.address() as AddressInfo).port

    try {
      const { base } = await start({ CHURNKEY_API_URL: `http://127.0.0.1:${apiPort}` })
      const first = `ck_oat_${'a'.repeat(64)}`
      const refreshed = `ck_oat_${'b'.repeat(64)}`

      // The response is an SSE stream, so it must be drained to completion —
      // fetch resolves on headers alone, before the tool has actually run.
      const callTool = async (token: string) => {
        const res = await fetch(`${base}/mcp`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'get_account', arguments: {} },
          }),
        })
        return { status: res.status, body: await res.text() }
      }

      const firstCall = await callTool(first)
      expect(firstCall.status).toBe(200)
      // No isError — the call actually reached the stub and succeeded.
      expect(firstCall.body).not.toContain('isError')

      const refreshedCall = await callTool(refreshed)
      expect(refreshedCall.status).toBe(200)
      expect(refreshedCall.body).not.toContain('isError')

      expect(received).toEqual([`Bearer ${first}`, `Bearer ${refreshed}`])
    } finally {
      await new Promise((resolve) => api.close(resolve))
    }
  })
})

describe('http — protected-resource metadata default URL', () => {
  it('builds the default public URL from the CONFIGURED host:port (an explicit port)', async () => {
    const { base } = await start({ CHURNKEY_MCP_PORT: '4555', CHURNKEY_API_URL: 'https://api.churnkey.co/v1' })
    // NOTE: start() listens on the configured 4555 here (not ephemeral).
    const res = await fetch(`http://127.0.0.1:4555/.well-known/oauth-protected-resource`)
    const body = (await res.json()) as {
      resource: string
      authorization_servers: string[]
      bearer_methods_supported: string[]
      scopes_supported: string[]
    }
    expect(body.resource).toBe('http://127.0.0.1:4555')
    expect(body.authorization_servers).toEqual(['https://api.churnkey.co'])
    expect(body.bearer_methods_supported).toEqual(['header'])
    // RFC 9728: the PRM must advertise scopes so generic MCP clients request
    // them; otherwise they authorize with an empty scope set and the AS rejects
    // it ("At least one scope is required").
    expect(Array.isArray(body.scopes_supported)).toBe(true)
    expect(body.scopes_supported.length).toBeGreaterThan(0)
    expect(body.scopes_supported).toContain('cancel_flows.blueprints.read')
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

  it('also serves the path-aware variant /.well-known/oauth-protected-resource/mcp', async () => {
    const { base } = await start()
    const variant = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)
    expect(variant.status).toBe(200)
    const root = await fetch(`${base}/.well-known/oauth-protected-resource`)
    expect(await variant.json()).toEqual(await root.json())
  })
})
