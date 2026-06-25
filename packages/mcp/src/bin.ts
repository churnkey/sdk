import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { runAuthCommand } from './auth/commands'
import { loadConfig } from './config'
import { startHttpServer } from './http'
import { createServer } from './server'

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === 'auth') {
    await runAuthCommand(args.slice(1))
    return
  }

  if (useHttpTransport()) {
    const httpServer = await startHttpServer()
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        httpServer.close(() => resolve())
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    })
    return
  }

  const config = loadConfig()
  const server = createServer(config)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

function useHttpTransport(): boolean {
  return (
    process.argv.includes('--http') ||
    process.argv.includes('--transport=http') ||
    process.env.CHURNKEY_MCP_TRANSPORT === 'http'
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
