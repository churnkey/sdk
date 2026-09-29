import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { OpenAIExtensions, type OpenAIUiToolMetadata } from '@openai/mcp-extensions/server'
import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import { createHtml } from './html'

// Replaced with the self-contained UI bundle by tsup; source tests exercise registration without a build.
declare const __FLOW_EXPLORER_HTML__: string
export const FLOW_EXPLORER_URI = 'ui://churnkey/flow-explorer-v1'
export interface Flow {
  flowId: string
  name: string
  scope: string
  status: string
  published: boolean
  hasUnpublishedChanges: boolean
  editableBlueprintId: string | null
  publishedBlueprintId: string | null
}
interface Account {
  org: { id: string; name: string }
  mode: string
}
export const flowResourceUri = (id: string) => `churnkey://flows/${encodeURIComponent(id)}`

export function registerFlowExplorer(server: McpServer, client: ChurnkeyClient) {
  const extensions = new OpenAIExtensions(server)
  const inventory = () => client.get<{ flows: Flow[] }>('/data/blueprints')
  registerAppResource(server, 'flow-explorer', FLOW_EXPLORER_URI, {}, async () => ({
    contents: [
      {
        uri: FLOW_EXPLORER_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: typeof __FLOW_EXPLORER_HTML__ === 'undefined' ? createHtml('') : __FLOW_EXPLORER_HTML__,
        _meta: {
          ui: { csp: { connectDomains: [], resourceDomains: [] } },
          'openai/ui': { preferredDisplayMode: 'fullscreen', availableDisplayModes: ['inline', 'fullscreen'] },
        },
      },
    ],
  }))
  registerAppTool(
    server,
    'open_flow_explorer',
    {
      title: 'Churnkey Flow Explorer',
      description:
        'Open a visual library of cancel flows. Inspect a published version, review live performance, and ask about the selected flow. Read-only; configuration is shared across modes.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      _meta: {
        ui: { resourceUri: FLOW_EXPLORER_URI },
        'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] } satisfies OpenAIUiToolMetadata,
      },
    },
    async () => {
      try {
        // Orient first and fail closed on auth/scope errors. Never cache inventory across users.
        const account = await client.get<Account>('/data/account')
        const { flows } = await inventory()
        const data = { workspace: account.org, sessionMode: account.mode, metricsMode: 'live', flows }
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
        }
      }
    },
  )
  server.registerResource(
    'cancel-flow',
    new ResourceTemplate('churnkey://flows/{flowId}', { list: undefined }),
    {
      title: 'Churnkey cancel flow',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = z.string().min(1).max(200).parse(variables.flowId)
      const { flows } = await inventory()
      const flow = flows.find((item) => item.flowId === id)
      if (!flow) throw new Error('Flow is unavailable in the current workspace.')
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({
              flow,
              metricsScope: flow.publishedBlueprintId ? { blueprintId: flow.publishedBlueprintId } : null,
              note: 'Configuration is shared across modes. Use get_blueprint for steps and get_flow_metrics for live performance. Warehouse refresh is about 3 hours.',
            }),
          },
        ],
      }
    },
  )
  extensions.mentions.setHandler(async ({ query }) => {
    const { flows } = await inventory()
    const term = query.trim().toLowerCase()
    return {
      items: flows
        .filter((flow) => flow.name.toLowerCase().includes(term))
        .slice(0, 20)
        .map((flow) => ({
          type: 'resource' as const,
          resourceUri: flowResourceUri(flow.flowId),
          title: flow.name,
          subtitle: `${flow.status.replaceAll('_', ' ')}${flow.hasUnpublishedChanges ? ' · unpublished changes' : ''}`,
        })),
    }
  })
}
