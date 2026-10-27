import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

export const ORG_INPUT = z
  .string()
  .trim()
  .min(1)
  .describe('Workspace to act on: its org id or appId. Look it up with find_org first; names are not accepted here.')

export function internalTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'find_org',
      title: 'Find a workspace',
      description: [
        'Churnkey staff only. Finds customer workspaces (orgs) by org id, appId, Stripe Connect account (acct_…), Churnkey billing customer (cus_…), or part of the name. Exact identifiers win; otherwise up to 15 name matches come back, newest first.',
        '',
        'Every other tool on this server takes `org` (the org id or appId from this result). When several workspaces match a name, confirm with the user which one is meant before acting.',
      ].join('\n'),
      inputSchema: z.object({
        query: z.string().trim().min(1).describe('Org id, appId, acct_…, cus_…, or part of the workspace name'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      handler: async ({ query }) => client.get('/data/internal/orgs', { query: { query } }),
    },
  ]
}
