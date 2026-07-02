import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

export function auditTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'get_audit_log',
      title: 'Read the workspace audit log',
      description: [
        'The org audit trail: every configuration change, publish, A/B decision, DNS change, campaign interrupt, consent grant/revocation, and MCP session read — attributed to a user, source (mcp-oauth / data-api / dashboard), client, and scopes used. Each entry includes a quotable `summary` line; settings changes carry before/after values.',
        '',
        'Use to answer "who changed what, and when". Filter by source ("mcp-oauth" to see only agent actions), name (exact audit event name), or date range; paginate with limit/skip (newest first). Requires the account.audit_log.read scope (owner/admin ceiling).',
      ].join('\n'),
      inputSchema: z.object({
        source: z
          .enum(['mcp-oauth', 'data-api', 'dashboard'])
          .optional()
          .describe('Only entries from this channel. "mcp-oauth" = agent actions.'),
        name: z.string().optional().describe('Exact audit event name, e.g. "data-api-blueprint-publish".'),
        startDate: z.string().optional().describe('ISO date lower bound.'),
        endDate: z.string().optional().describe('ISO date upper bound.'),
        limit: z.number().int().min(1).max(200).optional().describe('Default 50, max 200.'),
        skip: z.number().int().min(0).optional().describe('Pagination offset.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) => client.get('/data/audit-log', { query: args as Record<string, unknown> }),
    },
  ]
}
