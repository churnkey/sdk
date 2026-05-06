import { fileURLToPath } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config'
import { createServer } from './server'

export type { ChurnkeyMcpConfig } from './config'
export { loadConfig } from './config'
export { createServer, SERVER_NAME, SERVER_VERSION } from './server'

async function main() {
  const config = loadConfig()
  const server = createServer(config)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

const isEntrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
