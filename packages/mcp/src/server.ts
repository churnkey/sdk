import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDashboard } from './apps/dashboard'
import { registerMentions } from './apps/mentions'
import { ChurnkeyClient } from './client'
import type { ChurnkeyMcpConfig } from './config'
import { allTools } from './tools'
import { MODE_DATA_NOTE, MODE_TRAFFIC_NOTE } from './tools/shared'

export const SERVER_NAME = 'churnkey-mcp'
export const SERVER_VERSION = '2.3.0'

// Directories build their listing from whatever `initialize` returns. Sending
// only name and version is why Smithery rendered us as a lowercase "churnkey"
// with an empty description — there was nothing else to read. Every crawler
// that scans the endpoint reads the same fields, so this is the one place to
// fix it rather than per-directory.
const SERVER_TITLE = 'Churnkey'
const SERVER_DESCRIPTION =
  'Read Churnkey retention data and manage cancel flows, offers, segments, and payment recovery campaigns.'
const SERVER_WEBSITE = 'https://churnkey.co/feature/mcp'

// Monochrome `currentColor` glyph on a 20x20 viewport, per the OpenAI plugin
// icon guidelines. ChatGPT falls back to the server icon for sidebar
// entrypoints (the MCP SDK has no per-tool `icons` yet), and other hosts show
// it next to the server name.
const SERVER_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.33" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.75 16.25 6.4v7.2L10 17.25 3.75 13.6V6.4z"/><path d="M7.25 10.25 9.25 12.25 12.75 8"/></svg>'
const SERVER_ICON = {
  src: `data:image/svg+xml,${encodeURIComponent(SERVER_ICON_SVG)}`,
  mimeType: 'image/svg+xml',
  sizes: ['any'],
}

export function createServer(config: ChurnkeyMcpConfig): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    title: SERVER_TITLE,
    version: SERVER_VERSION,
    description: SERVER_DESCRIPTION,
    websiteUrl: SERVER_WEBSITE,
    icons: [SERVER_ICON],
  })
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

  // MCP Apps + OpenAI plugin extensions. These carry their own result shape
  // (structuredContent for the UI), so they register outside the JSON-text
  // wrapper above.
  registerDashboard(server, client)
  registerMentions(server, client)

  return server
}
