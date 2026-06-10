import { randomUUID } from 'node:crypto'
import { createServer as createNodeServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { type ChurnkeyMcpHttpConfig, loadHttpRequestConfig, loadHttpServerConfig } from './config'
import { createServer } from './server'

type HttpServer = ReturnType<typeof createNodeServer>

interface HttpSession {
  transport: StreamableHTTPServerTransport
}

export async function startHttpServer(env: NodeJS.ProcessEnv = process.env): Promise<HttpServer> {
  const config = loadHttpServerConfig(env)
  const sessions = new Map<string, HttpSession>()

  const httpServer = createNodeServer(async (req, res) => {
    try {
      setCorsHeaders(req.headers, res, env)

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end()
        return
      }

      const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? `${config.host}:${config.port}`}`)
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
        res.writeHead(401, { 'content-type': 'text/plain' }).end(message)
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
