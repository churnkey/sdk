import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ChurnkeyClient } from './client'
import type { ChurnkeyMcpConfig } from './config'
import { allTools } from './tools'

export const SERVER_NAME = 'churnkey-mcp'
export const SERVER_VERSION = '1.0.0'

export function createServer(config: ChurnkeyMcpConfig): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  const client = new ChurnkeyClient(config)

  for (const tool of allTools(client)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
        annotations: tool.annotations,
      },
      async (args: unknown) => {
        try {
          const parsed = tool.inputSchema.parse(args ?? {})
          const result = await tool.handler(parsed)
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return {
            isError: true,
            content: [{ type: 'text', text: message }],
          }
        }
      },
    )
  }

  return server
}
