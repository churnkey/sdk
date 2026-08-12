import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ChurnkeyClient } from './client'
import type { ChurnkeyMcpConfig } from './config'
import { allTools } from './tools'
import { MODE_DATA_NOTE, MODE_TRAFFIC_NOTE } from './tools/shared'

export const SERVER_NAME = 'churnkey-mcp'
export const SERVER_VERSION = '2.1.0'

export function createServer(config: ChurnkeyMcpConfig): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION })
  const client = new ChurnkeyClient(config)

  for (const tool of allTools(client)) {
    // Mode-scoped tools get a mode-sensitivity note appended to their
    // description (data reads vs live-traffic actions, by readOnlyHint) so the
    // agent knows the result/effect belongs to one mode. Config tools are
    // mode-agnostic and keep their description as-is.
    const description = tool.modeScoped
      ? `${tool.description}\n\n${tool.annotations?.readOnlyHint ? MODE_DATA_NOTE : MODE_TRAFFIC_NOTE}`
      : tool.description
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description,
        inputSchema: tool.inputSchema.shape,
        annotations: tool.annotations,
      },
      async (args: unknown) => {
        try {
          const parsed = tool.inputSchema.parse(args ?? {})
          const result = await tool.handler(parsed)
          const content: Array<{ type: 'text'; text: string }> = [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ]
          // Echo the workspace this call acted on (from the API's
          // X-Churnkey-Acting-Org-* headers) as a separate block — keeps the
          // JSON result intact while letting an agent, or a user with grants in
          // several orgs, always confirm the target workspace.
          const org = client.lastActingOrg
          if (org) {
            content.push({ type: 'text', text: `Acting on workspace: ${org.name ?? org.id} (org ${org.id}).` })
          }
          // Echo the effective mode on mode-scoped results so an agent never has
          // to infer live-vs-test from empty/unexpected data. Config tools are
          // mode-agnostic, so this would be misleading noise there — skip them.
          if (tool.modeScoped) {
            content.push({
              type: 'text',
              text: `Mode: ${client.mode.toUpperCase()} — runtime data and live actions are scoped to ${client.mode} mode (configuration is shared across modes).`,
            })
          }
          return { content }
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
