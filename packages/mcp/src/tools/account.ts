import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

export function accountTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'get_account',
      title: 'Get account & session context',
      description: [
        'Identity and session context for the current connection: which workspace (org) the token acts on, the authenticated user, coarse entitlements (active subscription, Churnkey Intelligence access), the granted OAuth scopes, and — importantly — the EFFECTIVE MODE (live or test).',
        '',
        'Call this FIRST to orient yourself before reading data or making changes, especially to confirm which workspace and which mode you are operating in. The scopes tell you which operations are permitted (so you can avoid a guaranteed 403).',
        '',
        'Mode note: configuration (blueprints, segments, surveys, settings) is shared across live and test mode; only runtime data (sessions, metrics, recoveries, campaigns) and live traffic/sends are mode-scoped. Mode defaults to live.',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/account'),
    },
  ]
}
