import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../dist/index.js'
import { fixture } from './fixtures.mjs'

const port = Number(process.env.CHURNKEY_DEMO_PORT || 4319)
const origin = `http://127.0.0.1:${port}`
const host = (await build({ entryPoints: [new URL('./host.ts', import.meta.url).pathname], bundle: true, format: 'esm', write: false, platform: 'browser', target: 'es2022' })).outputFiles[0].text
const client = new Client({ name: 'churnkey-demo', version: '1' })
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
const mcp = createServer({ baseUrl: `${origin}/fixture/v1`, auth: { kind: 'bearer', token: 'synthetic-demo-token' } })
const allowedTools = new Set(['open_flow_explorer', 'get_blueprint', 'get_flow_metrics', 'search_mentions'])
const http = createHttpServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin)
    const send = (type, data, status = 200) => { res.writeHead(status, { 'content-type': type }); res.end(typeof data === 'string' ? data : JSON.stringify(data)) }
    if (req.method === 'GET') {
      if (url.pathname.startsWith('/fixture/v1/data/')) {
        const data = fixture(url)
        return send('application/json', data ?? { message: 'Unknown synthetic API route' }, data ? 200 : 404)
      }
      if (url.pathname === '/') return send('text/html', await readFile(new URL('./index.html', import.meta.url), 'utf8'))
      if (url.pathname === '/host.js') return send('text/javascript', host)
      if (url.pathname === '/app') {
        const resource = await client.readResource({ uri: 'ui://churnkey/flow-explorer-v1' })
        return send('text/html', resource.contents[0].text)
      }
    }
    if (req.method === 'POST' && ['/tool', '/resource'].includes(url.pathname)) {
      if (req.headers.origin && req.headers.origin !== origin) return send('text/plain', 'Origin rejected', 403)
      let body = ''
      for await (const chunk of req) { body += chunk; if (body.length > 16384) return send('text/plain', 'Request too large', 413) }
      const input = JSON.parse(body)
      if (url.pathname === '/tool') {
        if (!allowedTools.has(input.name)) return send('text/plain', 'Only demo read tools are allowed.', 403)
        return send('application/json', await client.callTool(input))
      }
      if (!/^churnkey:\/\/flows\/[a-z]+$/.test(input.uri)) return send('text/plain', 'Unknown demo resource', 400)
      return send('application/json', await client.readResource(input))
    }
    send('text/plain', 'Not found', 404)
  } catch (error) { res.writeHead(500, { 'content-type': 'text/plain' }); res.end(error.message) }
})
await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve) })
await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])
console.log(`Synthetic MCP Apps demo: ${origin}`)
const stop = async () => { await client.close(); await mcp.close(); http.close() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
