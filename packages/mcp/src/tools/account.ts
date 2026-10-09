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
        '',
        'Payment recovery: `paymentRecovery.readiness` says whether recovery (dunning) emails can actually be sent. Check `ready` and `blockers` before publishing or enabling a payment recovery campaign. A `NO_RECOVERY_LINK` blocker means there is no recovery page domain, so recovery emails would fail to send; fix it with set_hosted_subdomain (works immediately) or a custom domain first. A custom domain counts as soon as add_custom_domain registers it, before it resolves, so `ready` can be true while the link host is not live yet: wait until check_domain_status reports the domain live before publishing or enabling. `warnings` (e.g. `NO_VERIFIED_SENDER_DOMAIN`) do not block publishing but should be relayed to the user. Each blocker and warning carries a `nextStep`. `readiness` is null when it could not be computed: call get_account again (the server-side check on publish and enable still applies). Older API versions omit the field.',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      handler: async () => client.get('/data/account'),
    },
  ]
}
