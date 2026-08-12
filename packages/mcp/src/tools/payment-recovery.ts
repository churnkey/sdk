import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import { confirmLiteral } from './shared'
import type { ToolDefinition } from './types'

const blueprintId = z.string().describe('Campaign blueprint id (from list_recovery_blueprints).')
const campaignId = z.string().describe('Running campaign instance id (from list_recovery_campaigns).')

// Shape of the dunning audience-attribute palette returned by
// list_recovery_audience_attributes (GET /data/payment-recovery/audience-attributes).
interface AudienceAttributeCatalog {
  builtIn?: { attribute?: string }[]
  custom?: { attribute?: string }[]
}

// Fail-fast client-side check (XDEV-2380, the SDK complement to the api#885
// server-side fix): reject filter attributes that are neither in the dunning
// built-in palette nor one of the org's custom attributes BEFORE the round-trip,
// so the agent gets a clear error instead of a server-side 422. Uses the SAME
// source as list_recovery_audience_attributes.
async function assertKnownAudienceAttributes(client: ChurnkeyClient, filters: { attribute: string }[]): Promise<void> {
  const catalog = await client.get<AudienceAttributeCatalog>('/data/payment-recovery/audience-attributes')
  const known = new Set(
    [...(catalog.builtIn ?? []), ...(catalog.custom ?? [])].map((entry) => entry.attribute).filter(Boolean),
  )
  filters.forEach((filter, index) => {
    if (!known.has(filter.attribute)) {
      throw new Error(
        `filter[${index}].attribute "${filter.attribute}" is not a known attribute or one of your custom attributes. ` +
          'Call list_recovery_audience_attributes for the supported attributes (custom attributes are also allowed).',
      )
    }
  })
}

const emailUpdates = z
  .object({
    enabled: z
      .boolean()
      .optional()
      .describe(
        'Whether this email sends as part of the sequence. A step cannot have both its email and SMS disabled.',
      ),
    subject: z.string().optional().describe('Email subject line (dashboard cap: 80 characters of text).'),
    previewText: z.string().optional().describe('Inbox preview text (cap: 140 characters of text).'),
    content: z
      .string()
      .optional()
      .describe(
        'HTML body (cap: 2000 characters of text, markup excluded). MUST include a payment CTA: a <cta text="..." open="false">[[...]]</cta> tag or the {{action_url}} merge tag. Merge tags use {{double_braces}}.',
      ),
    from: z
      .string()
      .optional()
      .describe('Sender email address (cap: 45 chars). Changing sender identity can hurt deliverability.'),
    senderName: z.string().optional().describe('Sender display name (cap: 45 chars).'),
    replyTo: z.string().optional().describe('Reply-to address (cap: 45 chars).'),
    sendOnDay: z
      .number()
      .int()
      .min(0)
      .max(60)
      .optional()
      .describe(
        'Days after the failed payment to send (0 = immediately). Day-0 emails cannot auto-retry. Also moves the paired SMS (the pair shares its schedule).',
      ),
    timeToSend: z
      .string()
      .optional()
      .describe('Time of day in the customer\'s timezone, "HH:MM" 24h (e.g. "09:30"). Also moves the paired SMS.'),
    ctaText: z.string().optional().describe('CTA button label on the payment update page (cap: 200 chars).'),
    autoRetry: z.boolean().optional().describe('Retry the payment automatically when this email sends (not on day 0).'),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Pass at least one email field to update.' })

const smsUpdates = z
  .object({
    enabled: z
      .boolean()
      .optional()
      .describe(
        'Whether the SMS sends. Requires the org SMS feature (dashboard → Payment Recovery settings). A step cannot have both its email and SMS disabled.',
      ),
    content: z
      .string()
      .optional()
      .describe(
        'SMS body as HTML with merge-field tags, like the default template (cap: 160 characters of text — one SMS segment). Include <magic-link>[[MAGIC LINK]]</magic-link> so the customer can act. Merge fields: FIRST_NAME, ORG_NAME, CARD_BRAND, LAST_4, PLAN_NAME, DISCOUNT_AMOUNT, DISCOUNT_DURATION, DISCOUNT_DESCRIPTION + org custom attributes.',
      ),
    sendOnDay: z
      .number()
      .int()
      .min(0)
      .max(60)
      .optional()
      .describe('Days after the failed payment. Also moves the paired email (the pair shares its schedule).'),
    timeToSend: z.string().optional().describe('"HH:MM" 24h. Also moves the paired email.'),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Pass at least one SMS field to update.' })

const audienceFilter = z
  .object({
    attribute: z
      .string()
      .describe('Attribute name from list_recovery_audience_attributes (built-in or org custom attribute).'),
    operand: z
      .enum(['INCLUDES', 'NOT_INCLUDES', 'GTE', 'LTE', 'BETWEEN', 'NOT_BETWEEN'])
      .describe('Strings/booleans use INCLUDES/NOT_INCLUDES; numbers/dates use GTE/LTE/BETWEEN/NOT_BETWEEN.'),
    value: z
      .array(z.union([z.string(), z.number(), z.boolean()]))
      .describe('Match values. BETWEEN/NOT_BETWEEN take exactly 2 entries.'),
    type: z
      .enum(['STRING', 'NUMBER', 'BOOLEAN', 'DATE'])
      .optional()
      .describe('Only for org custom attributes: the attribute value type.'),
  })
  .strict()

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
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      handler: async (args) =>
        client.get('/data/payment-recovery/blueprints', { query: args as Record<string, unknown> }),
    },
    {
      name: 'get_recovery_blueprint',
      title: 'Get a recovery campaign config',
      description:
        'Full campaign configuration: the email sequence (each with guid, subject, content, cadence sendOnDay/timeToSend, sender identity, autoRetry), SMS sequence, and audience filters. Use the email guids with update_recovery_email.',
      inputSchema: z.object({ blueprintId }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
        confirm: confirmLiteral('clone_recovery_blueprint'),
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
      name: 'update_recovery_email_offers',
      title: 'Set offers on a recovery email',
      description: [
        "Attach, replace, or remove the offers presented on one email's payment update page. Each email carries at most one of each (matching the dashboard toggles):",
        '- `discount`: a provider coupon applied when the customer updates payment ({ couponId }). The coupon id is NOT validated against the payment provider — verify it exists there.',
        '- `invoiceDiscount`: a one-time discount on the outstanding invoice ({ type: "PERCENT" (≤100) | "AMOUNT" ($), amount > 0 }).',
        'Pass null to remove an offer. Dashboard parity: the first offer auto-fills an empty ctaText with "Update Payment & Accept Offers"; removing the last offer resets it; offers mirror to the paired SMS. **Draft-only** — publish to go live.',
      ].join('\n'),
      inputSchema: z.object({
        blueprintId,
        emailGuid: z.string().describe('Email guid from get_recovery_blueprint.'),
        discount: z
          .union([z.object({ couponId: z.string().min(1).describe('Payment-provider coupon id.') }).strict(), z.null()])
          .optional()
          .describe('Set/replace the coupon offer, or null to remove it.'),
        invoiceDiscount: z
          .union([
            z
              .object({
                type: z.enum(['PERCENT', 'AMOUNT']).describe('Percentage off, or fixed amount ($) off the invoice.'),
                amount: z.number().positive().describe('Discount size. PERCENT must be ≤ 100.'),
              })
              .strict(),
            z.null(),
          ])
          .optional()
          .describe('Set/replace the one-time invoice discount, or null to remove it.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handler: async (args) => {
        const { blueprintId: id, emailGuid, ...body } = args as { blueprintId: string; emailGuid: string }
        return client.post(
          `/data/payment-recovery/blueprints/${encodeURIComponent(id)}/email/${encodeURIComponent(emailGuid)}/offers`,
          { body },
        )
      },
    },
    {
      name: 'update_recovery_sms',
      title: 'Edit the SMS half of a recovery step',
      description: [
        "Patch the SMS companion of a message step (it shares the email's guid). **Draft-only** — publish to go live.",
        'Enabling requires the org SMS feature; a step cannot have both channels disabled; content is capped at 160 text characters (one SMS segment) and should include a <magic-link> tag. Schedule changes (sendOnDay/timeToSend) also move the paired email.',
      ].join('\n'),
      inputSchema: z.object({
        blueprintId,
        emailGuid: z.string().describe('The step guid (shared by the email and its SMS) from get_recovery_blueprint.'),
        updates: smsUpdates,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handler: async (args) => {
        const {
          blueprintId: id,
          emailGuid,
          ...body
        } = args as { blueprintId: string; emailGuid: string; updates: unknown }
        return client.post(
          `/data/payment-recovery/blueprints/${encodeURIComponent(id)}/sms/${encodeURIComponent(emailGuid)}`,
          { body },
        )
      },
    },
    {
      name: 'add_recovery_email',
      title: 'Add a step to a recovery sequence',
      description:
        'Append a message step to the campaign: the new email inherits the last step (sender, subject, content, offers) scheduled one day later, with a paired SMS sharing the new guid (off unless the org SMS feature allows it). Then tailor it with update_recovery_email / update_recovery_sms. **Draft-only** — publish to go live.',
      inputSchema: z.object({ blueprintId }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handler: async (args) =>
        client.post(
          `/data/payment-recovery/blueprints/${encodeURIComponent((args as { blueprintId: string }).blueprintId)}/emails`,
          { body: {} },
        ),
    },
    {
      name: 'remove_recovery_email',
      title: 'Remove a step from a recovery sequence',
      description:
        '**Destructive for the draft**: deletes the email AND its paired SMS from the sequence — the step\'s content is not recoverable. At least one step must remain. Requires confirm: "remove_recovery_email". After publishing, pending sends for the removed step are dropped from in-flight sequences.',
      inputSchema: z.object({
        confirm: confirmLiteral('remove_recovery_email'),
        blueprintId,
        emailGuid: z.string().describe('Email guid from get_recovery_blueprint.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const {
          blueprintId: id,
          emailGuid,
          ...body
        } = args as { blueprintId: string; emailGuid: string; confirm: string }
        return client.post(
          `/data/payment-recovery/blueprints/${encodeURIComponent(id)}/email/${encodeURIComponent(emailGuid)}/remove`,
          { body },
        )
      },
    },
    {
      name: 'list_recovery_audience_attributes',
      title: 'List recovery audience filter attributes',
      description:
        'The attribute palette for payment recovery audience filters (dunning-scoped: decline type/reason, payment method category, invoice amount/currency, customer country/contactability, plus subscription basics and org custom attributes). Each entry lists its valueType, allowed operands, and fixed values (or suggestedValues where free entry is legal, e.g. decline reason). Call before update_recovery_audience.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      handler: async () => client.get('/data/payment-recovery/audience-attributes'),
    },
    {
      name: 'update_recovery_audience',
      title: 'Edit a recovery campaign audience',
      description: [
        'Rename the campaign and/or replace its audience filter rules (which failed payments it matches; rules combine with AND). **Draft-only** — publish to apply; running sequences are not re-matched.',
        'Filters validate against the dunning palette (list_recovery_audience_attributes). Filter edits are blocked while the campaign is in an active A/B test (renames stay legal). The primary catch-all campaign has no audience to edit.',
      ].join('\n'),
      inputSchema: z.object({
        blueprintId,
        name: z.string().min(1).max(60).optional().describe('Campaign/audience name (dashboard cap: 60 chars).'),
        filters: z
          .array(audienceFilter)
          .optional()
          .describe(
            'Replacement rule set (AND semantics). [] matches every failed payment not claimed by another campaign.',
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handler: async (args) => {
        const { blueprintId: id, ...body } = args as {
          blueprintId: string
          filters?: { attribute: string }[]
        }
        // Validate filter attributes against the live palette before the update
        // round-trip (only when filters are being replaced — renames don't touch them).
        if (body.filters?.length) {
          await assertKnownAudienceAttributes(client, body.filters)
        }
        return client.post(`/data/payment-recovery/blueprints/${encodeURIComponent(id)}/audience`, { body })
      },
    },
    {
      name: 'set_recovery_blueprint_enabled',
      title: 'Turn a recovery campaign on or off',
      description:
        '**Live-impacting and immediate**: matches the dashboard toggle, which saves AND publishes in one step. Disabling stops the campaign from matching new failed payments right away (in-flight sequences continue — use stop_recovery_campaign for those); enabling puts it back in rotation. Blocked during an active A/B test and on the primary catch-all campaign. Requires confirm: "set_recovery_blueprint_enabled". Confirm with the user first.',
      inputSchema: z.object({
        confirm: confirmLiteral('set_recovery_blueprint_enabled'),
        blueprintId,
        enabled: z.boolean().describe('true = live, false = off.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const { blueprintId: id, ...body } = args as { blueprintId: string; enabled: boolean; confirm: string }
        return client.post(`/data/payment-recovery/blueprints/${encodeURIComponent(id)}/enabled`, { body })
      },
    },
    {
      name: 'publish_recovery_blueprint',
      title: 'Publish a recovery campaign config',
      description:
        '**Live-impacting**: publishing rebuilds the PENDING emails of in-flight customer sequences with the new content/cadence (already-sent emails are unaffected). Requires confirm: "publish_recovery_blueprint". Audit-logged.',
      inputSchema: z.object({
        confirm: confirmLiteral('publish_recovery_blueprint'),
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
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
        customerEmail: z
          .string()
          .optional()
          .describe(
            'Exact customer email. Requires the payment_recovery.campaigns.read_pii scope (the filter is an identity probe).',
          ),
        limit: z.number().int().min(1).max(500).optional().describe('Default 100, max 500.'),
        skip: z.number().int().min(0).optional().describe('Pagination offset.'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      handler: async (args) =>
        client.get('/data/payment-recovery/campaigns', { query: args as Record<string, unknown> }),
    },
    {
      name: 'get_recovery_campaign_messages',
      title: 'Get the message timeline of one sequence',
      description:
        'Every email of one running/finished sequence: what was sent, delivered, opened (with dates), clicked, bounced, whether it recovered the payment, and the auto-retry status. emailTo requires read_pii.',
      inputSchema: z.object({ campaignId }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
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
        confirm: confirmLiteral('stop_campaign'),
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
