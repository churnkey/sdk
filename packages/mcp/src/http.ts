import { randomUUID } from 'node:crypto'
import { createServer as createNodeServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { type ChurnkeyMcpHttpConfig, loadHttpRequestConfig, loadHttpServerConfig, resolveBaseUrl } from './config'
import { createServer } from './server'

type HttpServer = ReturnType<typeof createNodeServer>

interface HttpSession {
  transport: StreamableHTTPServerTransport
}

const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource'

// The canonical public URL of THIS MCP server (e.g. https://mcp.churnkey.co),
// advertised as the OAuth resource identifier. Defaults to the local bind
// address for development.
function resolvePublicUrl(config: ChurnkeyMcpHttpConfig, env: NodeJS.ProcessEnv): string {
  return (env.CHURNKEY_MCP_PUBLIC_URL ?? `http://${config.host}:${config.port}`).replace(/\/$/, '')
}

// The Churnkey API origin acts as the OAuth authorization server; its RFC 8414
// metadata lives at <origin>/.well-known/oauth-authorization-server.
function resolveAuthorizationServer(env: NodeJS.ProcessEnv): string {
  return new URL(resolveBaseUrl(env)).origin
}

export async function startHttpServer(env: NodeJS.ProcessEnv = process.env): Promise<HttpServer> {
  const config = loadHttpServerConfig(env)
  const sessions = new Map<string, HttpSession>()
  const publicUrl = resolvePublicUrl(config, env)
  const resourceMetadataUrl = `${publicUrl}${PROTECTED_RESOURCE_PATH}`

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
      if (requestUrl.pathname === PROTECTED_RESOURCE_PATH) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({
            resource: publicUrl,
            authorization_servers: [resolveAuthorizationServer(env)],
            bearer_methods_supported: ['header'],
            resource_documentation: 'https://docs.churnkey.co/data-integrations/mcp',
          }),
        )
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

      const sessionId = getHeader(req.headers, 'mcp-session-id')
      const existing = sessionId ? sessions.get(sessionId) : undefined

      if (existing) {
        await existing.transport.handleRequest(req, res)
        return
      }

      if (sessionId) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('MCP session not found')
        return
      }

      if (req.method !== 'POST') {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Missing MCP session ID')
        return
      }

      const requestConfig = loadHttpRequestConfig(toFetchHeaders(req.headers), env)
      const server = createServer(requestConfig)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: (initializedSessionId) => {
          sessions.set(initializedSessionId, { transport })
        },
      })

      transport.onclose = () => {
        const initializedSessionId = transport.sessionId
        if (initializedSessionId) sessions.delete(initializedSessionId)
      }

      await server.connect(transport)
      await transport.handleRequest(req, res)
    } catch (err) {
      if (!res.headersSent) {
        const message = err instanceof Error ? err.message : String(err)
        // Point OAuth-capable MCP clients at the resource metadata (MCP auth spec).
        res
          .writeHead(401, {
            'content-type': 'text/plain',
            'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
          })
          .end(message)
      } else {
        res.end()
      }
    }
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(config.port, config.host, () => {
      httpServer.off('error', reject)
      resolve()
    })
  })

  const closeSessions = async () => {
    await Promise.all([...sessions.values()].map(({ transport }) => transport.close()))
    sessions.clear()
  }
  httpServer.once('close', () => {
    void closeSessions()
  })

  console.error(`Churnkey MCP HTTP server listening at http://${config.host}:${config.port}${config.path}`)
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
  res.setHeader('access-control-expose-headers', 'mcp-session-id')
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
