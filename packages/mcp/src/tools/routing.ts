import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const PRODUCT_PATH = { cancel_flows: 'segments', payment_recovery: 'payment-recovery' } as const

const product = z
  .enum(['cancel_flows', 'payment_recovery'])
  .describe('cancel_flows: cancel flow segments. payment_recovery: payment recovery (dunning) campaigns.')

const rule = z
  .object({
    attribute: z
      .string()
      .min(1)
      .describe(
        'Attribute name: from list_segment_attributes for cancel_flows, list_recovery_audience_attributes for payment_recovery (built-in or org custom attribute).',
      ),
    operand: z
      .enum(['INCLUDES', 'NOT_INCLUDES', 'GTE', 'LTE', 'BETWEEN', 'NOT_BETWEEN'])
      .describe('Strings/booleans use INCLUDES/NOT_INCLUDES; numbers/dates use GTE/LTE/BETWEEN/NOT_BETWEEN.'),
    value: z
      .array(z.union([z.string(), z.number(), z.boolean()]))
      .describe(
        'Match values. BETWEEN/NOT_BETWEEN take exactly 2 entries. Regular expression values (/pattern/) are refused.',
      ),
    type: z
      .enum(['STRING', 'NUMBER', 'BOOLEAN', 'DATE'])
      .optional()
      .describe('Value type for custom attributes only; omit for built-in attributes.'),
  })
  .strict()

const testRoutingInput = z.object({
  product,
  id: z
    .string()
    .min(1)
    .describe(
      'A customer ID (routes each of their live subscriptions) or a subscription ID (routes only that one). payment_recovery takes Stripe IDs (cus_…, sub_…).',
    ),
})

const estimateInput = z.object({
  product,
  filter: z
    .array(rule)
    .min(1)
    .describe(
      'The complete audience rules to estimate (AND semantics), as you would save them with update_segment_filter or update_recovery_audience.',
    ),
  segmentId: z
    .string()
    .optional()
    .describe('cancel_flows: the segment these rules are for, when editing an existing one.'),
  blueprintId: z
    .string()
    .optional()
    .describe('payment_recovery: the campaign blueprint these rules are for, when editing an existing one.'),
})

export function routingTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'test_routing',
      title: 'Test which flow or campaign a customer gets',
      description: [
        'Which cancel flow or payment recovery campaign a customer gets today, as live routing picks it. Each live subscription comes back with its plan (name, price, interval) and start date, and:',
        '- cancel_flows: `segmentId` (null = the default flow) and the A/B `abTest` arm. `unevaluatedSegmentIds` lists flows ahead of the match whose custom-attribute conditions are only known during a session, so the customer could get one of those instead.',
        '- payment_recovery: the newest `failedInvoice`, and either the `exclusionId` that keeps the payment out of recovery or the `campaignId` (blueprint id, null = no primary campaign) with its `abTest` arm. Without a failed invoice, invoice and decline conditions do not match.',
        '',
        "Map ids to names with list_segments or list_recovery_blueprints. No customer name or email is returned. Reads the billing provider in the session's mode; rate limited to 120 previews per hour.",
      ].join('\n'),
      inputSchema: testRoutingInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      modeScoped: true,
      handler: async (args) => {
        const { product, id } = args as z.infer<typeof testRoutingInput>
        return client.post(`/data/${PRODUCT_PATH[product]}/test-routing`, { body: { id } })
      },
    },
    {
      name: 'estimate_audience',
      title: 'Estimate what publishing audience rules would change',
      description: [
        "Estimate, from the org's own customers, what publishing these audience rules would do. Saves nothing. Returns:",
        '- `matching`: customers who meet every rule, wherever routing sends them now.',
        '- `allocated`: customers the flow or campaign would get once published. Under automatic routing (see get_account) Churnkey orders it by its conditions: narrower audiences go first, then smaller ones, and new rules go above the flows and campaigns no rule separates them from.',
        '- `changes`: live flows or campaigns (and the primary, `id: null`) whose audience would change, with `before` and `after` counts.',
        '- `duplicateOf`: a live flow or campaign with the same audience. Suggest using it, or an A/B test, instead of a copy.',
        "- `incomparable`: live cancel flows, in today's order, that may share customers with this one but can't be compared with it ahead of time (conditions only known during a session). Ask the user whether customers who match both should see this flow or the one they see today, and pass the answer to publish_blueprint as `placeBelow`: [] for this flow, all their ids for the current one. publish_blueprint refuses to publish without it.",
        '',
        'Counts are active subscriptions for cancel_flows and distinct failed invoices from the last `periodDays` (up to 90) days for payment_recovery, out of `total`. `sampled` means counts scale up from a random 10,000 (`approximate`). `sessionOnly` marks conditions only known during a session: the count covers the conditions checked ahead of time, and `uncounted` means none can be, so there is no count. `upperBound` means the count is the most it can get, because of its own session-only conditions or a session-only flow ahead.',
        '',
        'Call it before update_segment_filter or update_recovery_audience and publishing, and tell the user which flows or campaigns lose customers. The first call for an org can take about 20 seconds. Rate limited to 120 previews per hour.',
      ].join('\n'),
      inputSchema: estimateInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      handler: async (args) => {
        const { product, filter, segmentId, blueprintId } = args as z.infer<typeof estimateInput>
        return client.post(`/data/${PRODUCT_PATH[product]}/estimate`, {
          body: product === 'cancel_flows' ? { filter, segmentId } : { filter, blueprintId },
        })
      },
    },
  ]
}
