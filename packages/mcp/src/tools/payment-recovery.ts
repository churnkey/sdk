import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const blueprintId = z.string().describe('Campaign blueprint id (from list_recovery_blueprints).')
const campaignId = z.string().describe('Running campaign instance id (from list_recovery_campaigns).')

const emailUpdates = z
  .object({
    enabled: z.boolean().optional().describe('Whether this email sends as part of the sequence.'),
    subject: z.string().optional().describe('Email subject line.'),
    previewText: z.string().optional().describe('Inbox preview text.'),
    content: z
      .string()
      .optional()
      .describe(
        'HTML body. MUST include a payment CTA: a <cta text="..." open="false">[[...]]</cta> tag or the {{action_url}} merge tag. Merge tags use {{double_braces}}.',
      ),
    from: z.string().optional().describe('Sender email address. Changing sender identity can hurt deliverability.'),
    senderName: z.string().optional().describe('Sender display name.'),
    replyTo: z.string().optional().describe('Reply-to address.'),
    sendOnDay: z
      .number()
      .int()
      .min(0)
      .max(60)
      .optional()
      .describe('Days after the failed payment to send (0 = immediately). Day-0 emails cannot auto-retry.'),
    timeToSend: z.string().optional().describe('Time of day in the customer\'s timezone, "HH:MM" 24h (e.g. "09:30").'),
    ctaText: z.string().optional().describe('CTA button label.'),
    autoRetry: z.boolean().optional().describe('Retry the payment automatically when this email sends (not on day 0).'),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Pass at least one email field to update.' })

export function paymentRecoveryTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'list_recovery_blueprints',
      title: 'List payment recovery campaign configs',
      description:
        "List the org's payment recovery (dunning) campaign configurations: name, type (DELINQUENCY/RENEWAL/EXPIRATION), schedule, enabled state, email/SMS counts. These are the templates that spawn per-customer sequences — also the template library: clone one as a starting point.",
      inputSchema: z.object({
        campaignType: z.enum(['DELINQUENCY', 'RENEWAL', 'EXPIRATION']).optional().describe('Defaults to DELINQUENCY.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) =>
        client.get('/data/payment-recovery/blueprints', { query: args as Record<string, unknown> }),
    },
    {
      name: 'get_recovery_blueprint',
      title: 'Get a recovery campaign config',
      description:
        'Full campaign configuration: the email sequence (each with guid, subject, content, cadence sendOnDay/timeToSend, sender identity, autoRetry), SMS sequence, and audience filters. Use the email guids with update_recovery_email.',
      inputSchema: z.object({ blueprintId }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) =>
        client.get(
          `/data/payment-recovery/blueprints/${encodeURIComponent((args as { blueprintId: string }).blueprintId)}`,
        ),
    },
    {
      name: 'clone_recovery_blueprint',
      title: 'Clone a recovery campaign config',
      description:
        'Clone an existing campaign config as a new draft (the template-library path: start from a campaign that works and adjust). Requires confirm: "clone_recovery_blueprint".',
      inputSchema: z.object({
        confirm: z.literal('clone_recovery_blueprint').describe('Required confirmation literal.'),
        blueprintId,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handler: async (args) => {
        const { blueprintId: id, ...body } = args as { blueprintId: string; confirm: string }
        return client.post(`/data/payment-recovery/blueprints/${encodeURIComponent(id)}/clone`, { body })
      },
    },
    {
      name: 'update_recovery_email',
      title: 'Edit one email in a recovery sequence',
      description: [
        'Patch one email in a campaign config by guid: copy, cadence, sender identity, auto-retry. **Draft-only** — changes reach customers when you publish_recovery_blueprint.',
        '',
        'Validation is repairable: content must include a payment CTA, merge tags must balance, timeToSend is "HH:MM". Sender identity changes return a deliverability warning — relay it.',
      ].join('\n'),
      inputSchema: z.object({
        blueprintId,
        emailGuid: z.string().describe('Email guid from get_recovery_blueprint.'),
        updates: emailUpdates,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handler: async (args) => {
        const {
          blueprintId: id,
          emailGuid,
          ...body
        } = args as { blueprintId: string; emailGuid: string; updates: unknown }
        return client.post(
          `/data/payment-recovery/blueprints/${encodeURIComponent(id)}/email/${encodeURIComponent(emailGuid)}`,
          { body },
        )
      },
    },
    {
      name: 'publish_recovery_blueprint',
      title: 'Publish a recovery campaign config',
      description:
        '**Live-impacting**: publishing rebuilds the PENDING emails of in-flight customer sequences with the new content/cadence (already-sent emails are unaffected). Requires confirm: "publish_recovery_blueprint". Audit-logged.',
      inputSchema: z.object({
        confirm: z.literal('publish_recovery_blueprint').describe('Required confirmation literal.'),
        blueprintId,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const { blueprintId: id, ...body } = args as { blueprintId: string; confirm: string }
        return client.post(`/data/payment-recovery/blueprints/${encodeURIComponent(id)}/publish`, { body })
      },
    },
    {
      name: 'get_recovery_engagement',
      title: 'Get per-email engagement for a recovery campaign',
      description:
        'Open/click/bounce/recovery counts and rates per email in the sequence (operational store, no warehouse lag). Use this to decide which email to rewrite; use aggregate_payment_recoveries for dollar amounts.',
      inputSchema: z.object({ blueprintId }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) =>
        client.get(
          `/data/payment-recovery/blueprints/${encodeURIComponent((args as { blueprintId: string }).blueprintId)}/engagement`,
        ),
    },
    {
      name: 'list_recovery_campaigns',
      title: 'List running recovery sequences',
      description:
        'Per-customer campaign instances: who is in a sequence, active/recovered/lost state, amounts recovered and via which channel. Customer identity requires the payment_recovery.campaigns.read_pii scope (otherwise "[redacted]" — the shape is stable). Filter by blueprintId / active / recovered / customerEmail; paginate with limit/skip.',
      inputSchema: z.object({
        blueprintId: z.string().optional().describe('Scope to one campaign config.'),
        active: z.boolean().optional().describe('Only running (true) or finished (false) sequences.'),
        recovered: z.boolean().optional().describe('Only recovered (true) or unrecovered (false).'),
        customerEmail: z.string().optional().describe('Exact customer email (requires read_pii to be useful).'),
        limit: z.number().int().min(1).max(500).optional().describe('Default 100, max 500.'),
        skip: z.number().int().min(0).optional().describe('Pagination offset.'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) =>
        client.get('/data/payment-recovery/campaigns', { query: args as Record<string, unknown> }),
    },
    {
      name: 'get_recovery_campaign_messages',
      title: 'Get the message timeline of one sequence',
      description:
        'Every email of one running/finished sequence: what was sent, delivered, opened (with dates), clicked, bounced, whether it recovered the payment, and the auto-retry status. emailTo requires read_pii.',
      inputSchema: z.object({ campaignId }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) =>
        client.get(
          `/data/payment-recovery/campaigns/${encodeURIComponent((args as { campaignId: string }).campaignId)}/messages`,
        ),
    },
    {
      name: 'stop_recovery_campaign',
      title: 'Interrupt a running recovery sequence',
      description:
        '**Destructive and irreversible for this campaign run**: stops all future sends to this customer (already-sent emails are unaffected; the sequence cannot be resumed). Requires confirm: "stop_campaign"; optionally pass a reason for the audit log. Confirm with the user first.',
      inputSchema: z.object({
        confirm: z.literal('stop_campaign').describe('Required confirmation literal.'),
        campaignId,
        reason: z.string().optional().describe('Why the sequence is being stopped (recorded in the audit log).'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const { campaignId: id, ...body } = args as { campaignId: string; confirm: string; reason?: string }
        return client.post(`/data/payment-recovery/campaigns/${encodeURIComponent(id)}/stop`, { body })
      },
    },
  ]
}
