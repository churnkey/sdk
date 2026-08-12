import { createServer as createNodeServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { BASELINE_SCOPES } from './auth/oauth'
import { type ChurnkeyMcpHttpConfig, loadHttpRequestConfig, loadHttpServerConfig, resolveBaseUrl } from './config'
import { createServer } from './server'

type HttpServer = ReturnType<typeof createNodeServer>

const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource'
const OPENAI_CHALLENGE_PATH = '/.well-known/openai-apps-challenge'

/**
 * Thrown when a request carries no usable Churnkey credentials. Distinguished
 * from every other failure so only a genuine auth problem answers with 401 +
 * WWW-Authenticate — an unrelated crash answering 401 tells an OAuth client its
 * token is dead and sends the user back through the consent screen for nothing.
 */
class MissingCredentialsError extends Error {}

// The canonical public URL of THIS MCP server (e.g. https://mcp.churnkey.co),
// advertised as the OAuth resource identifier. Defaults to the local bind
// address for development.
function resolvePublicUrl(config: ChurnkeyMcpHttpConfig, env: NodeJS.ProcessEnv, boundPort?: number): string {
  // Prefer the actually-bound port over the configured one: with an ephemeral
  // bind (port 0) `config.port` is still 0, which would advertise a useless
  // `http://host:0` resource identifier. An explicit public URL always wins.
  const port = boundPort ?? config.port
  return (env.CHURNKEY_MCP_PUBLIC_URL ?? `http://${config.host}:${port}`).replace(/\/$/, '')
}

// The Churnkey API origin acts as the OAuth authorization server; its RFC 8414
// metadata lives at <origin>/.well-known/oauth-authorization-server.
function resolveAuthorizationServer(env: NodeJS.ProcessEnv): string {
  return new URL(resolveBaseUrl(env)).origin
}

export async function startHttpServer(env: NodeJS.ProcessEnv = process.env): Promise<HttpServer> {
  const config = loadHttpServerConfig(env)
  // Recomputed once the server is listening so an ephemeral (port 0) bind
  // advertises its real port; the request handler reads these by reference.
  let publicUrl = resolvePublicUrl(config, env)
  let resourceMetadataUrl = `${publicUrl}${PROTECTED_RESOURCE_PATH}`

  const httpServer = createNodeServer(async (req, res) => {
    try {
      setCorsHeaders(req.headers, res, env)

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end()
        return
      }

      const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? `${config.host}:${config.port}`}`)

      // RFC 9728 protected-resource metadata: lets spec-compliant MCP clients
      // discover the authorization server and run the OAuth flow themselves.
      // Served at both the root well-known and the path-aware variant
      // (`/.well-known/oauth-protected-resource/mcp`) — some clients (Claude.ai,
      // ChatGPT) probe the path-inserted form derived from the MCP endpoint URL.
      if (
        requestUrl.pathname === PROTECTED_RESOURCE_PATH ||
        requestUrl.pathname === `${PROTECTED_RESOURCE_PATH}${config.path}`
      ) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            resource: publicUrl,
            authorization_servers: [resolveAuthorizationServer(env)],
            bearer_methods_supported: ['header'],
            // Generic clients (Claude.ai, ChatGPT, Claude Code) take their
            // initial scope set from here when the 401 carries no `scope`, and
            // without the field at all they send an empty scope set, which the
            // authorization server rejects outright. The spec asks this to be
            // the minimal set for basic functionality rather than the whole
            // catalog — advertising everything is what puts writes and PII on
            // the first consent screen. The catalog itself is unchanged and
            // still advertised by the authorization server.
            scopes_supported: BASELINE_SCOPES,
            resource_documentation: 'https://docs.churnkey.co/data-integrations/mcp',
          }),
        )
        return
      }

      // OpenAI's plugin directory derives this path from the MCP server URL, so
      // a server at https://host/mcp is verified here by default. Their reviewer
      // fetches it unauthenticated, and the body has to be the bare token — JSON
      // or a list fails verification. Read from the environment so re-issuing a
      // token is a config change rather than a deploy.
      if (requestUrl.pathname === OPENAI_CHALLENGE_PATH) {
        const token = env.CHURNKEY_MCP_OPENAI_CHALLENGE_TOKEN
        if (!token) {
          res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
          return
        }
        res.writeHead(200, { 'content-type': 'text/plain' }).end(token)
        return
      }

      if (requestUrl.pathname !== config.path) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
        return
      }

      if (!isAllowedHost(req.headers, config)) {
        res.writeHead(403, { 'content-type': 'text/plain' }).end('Forbidden host')
        return
      }

      if (req.method !== 'POST') {
        // Stateless mode has no standalone SSE stream and no session to delete,
        // so GET/DELETE are transport probes. MCP clients (notably Claude.ai)
        // expect 405 + Allow here; a 400 breaks their transport detection, and
        // 405 is the spec's sanctioned "session termination not supported".
        res.writeHead(405, { 'content-type': 'text/plain', allow: 'POST' }).end('Method Not Allowed')
        return
      }

      // Credentials are read from THIS request, every request — the transport is
      // stateless (`sessionIdGenerator: undefined`), so a fresh server+client
      // pair is built per request and nothing carries over between them.
      //
      // Load-bearing, not stylistic. While the transport was stateful the bearer
      // token was captured once on `initialize` and reused for the life of the
      // session, so a hosted OAuth session died as soon as its 1-hour access
      // token expired: the client refreshed correctly, the new token arrived on
      // later requests, and we ignored it (XDEV-2487). Reading the header per
      // request is what lets a refreshed token take effect. It also drops the
      // sticky-routing requirement, and matches where the protocol is going —
      // SEP-2575 removes Mcp-Session-Id and requires every request to be
      // authenticated on its own. A stale session id from a client that
      // connected before this change is simply ignored, so live sessions
      // migrate without a reconnect.
      let requestConfig: ReturnType<typeof loadHttpRequestConfig>
      try {
        requestConfig = loadHttpRequestConfig(toFetchHeaders(req.headers), env)
      } catch (err) {
        throw new MissingCredentialsError(err instanceof Error ? err.message : String(err))
      }

      const server = createServer(requestConfig)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      // Per-request lifetime: tear both down once the response is done, or the
      // per-request servers would accumulate exactly like the sessions did.
      res.once('close', () => {
        void transport.close()
        void server.close()
      })

      await server.connect(transport)
      await transport.handleRequest(req, res)
    } catch (err) {
      if (res.headersSent) {
        res.end()
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      if (err instanceof MissingCredentialsError) {
        // Point OAuth-capable MCP clients at the resource metadata, and state the
        // scopes we actually want. A client that reads `scope` here never has to
        // fall back to `scopes_supported`, so this is what keeps writes and PII
        // off the first consent screen even for clients that ignore the metadata
        // document. RFC 6750 §3 for the parameter, MCP auth spec for the priority.
        res
          .writeHead(401, {
            'content-type': 'text/plain',
            'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl}", scope="${BASELINE_SCOPES.join(' ')}"`,
          })
          .end(message)
        return
      }
      // Anything else is our fault, not the caller's credentials. Answering 401
      // here would make an OAuth client discard a perfectly good token.
      res.writeHead(500, { 'content-type': 'text/plain' }).end(message)
    }
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', reject)
      resolve()
    })
  })

  // Resolve the real bound port (matters for an ephemeral `port: 0` bind) and
  // refresh the advertised OAuth resource identifier accordingly.
  const address = httpServer.address()
  const boundPort = typeof address === 'object' && address !== null ? address.port : config.port
  publicUrl = resolvePublicUrl(config, env, boundPort)
  resourceMetadataUrl = `${publicUrl}${PROTECTED_RESOURCE_PATH}`

  console.error(`Churnkey MCP HTTP server listening at http://${config.host}:${boundPort}${config.path}`)
  return httpServer
}

function setCorsHeaders(headers: IncomingHttpHeaders, res: ServerResponse, env: NodeJS.ProcessEnv) {
  const origin = getHeader(headers, 'origin')
  if (!origin) return
  const allowedOrigin = env.CHURNKEY_MCP_CORS_ORIGIN
  if (!allowedOrigin) return
  if (allowedOrigin !== '*' && allowedOrigin !== origin) return
  res.setHeader('access-control-allow-origin', allowedOrigin)
  res.setHeader('vary', 'origin')
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader(
    'access-control-allow-headers',
    'authorization, content-type, mcp-session-id, mcp-protocol-version, x-ck-app, x-ck-api-key, x-ck-mode',
  )
  res.setHeader('access-control-expose-headers', 'mcp-session-id, mcp-protocol-version, www-authenticate')
}

function isAllowedHost(headers: IncomingHttpHeaders, config: ChurnkeyMcpHttpConfig): boolean {
  if (!config.allowedHosts?.length) return true
  const host = getHeader(headers, 'host')
  if (!host) return false
  return config.allowedHosts.includes(host)
}

function toFetchHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item)
    } else if (value !== undefined) {
      result.set(key, value)
    }
  }
  return result
}

function getHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0]
  return value
}
