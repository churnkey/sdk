import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const reorderInput = z.object({
  segmentIds: z
    .array(z.string())
    .min(1)
    .describe(
      'Segment IDs in desired priority order. Any existing segments omitted from this list are kept after the provided IDs in their current relative order.',
    ),
  confirm: z
    .literal('reorder_segments')
    .describe(
      'Required confirmation. Segment priority can change which flow customers see; pass exactly "reorder_segments".',
    ),
})

const setEnabledInput = z.object({
  segmentId: z.string().describe('Churnkey segment ID. Use list_segments first if you do not know it.'),
  enabled: z
    .boolean()
    .describe('true to enable the segment (serve its flow to matching customers), false to disable it.'),
  confirm: z
    .literal('set_segment_enabled')
    .describe(
      'Required confirmation. Enabling/disabling changes which flow live customers see; pass exactly "set_segment_enabled".',
    ),
})

const SEGMENT_OPERANDS = ['INCLUDES', 'GT', 'LT', 'GTE', 'LTE', 'BETWEEN', 'NOT_INCLUDES', 'NOT_BETWEEN'] as const

// Catalog of the cancel-flow audience attributes, grouped by value type and the operands that apply.
// This is the cancel-flow palette (mirrors the dashboard's getEnabledSegmentAttributes('cancel-flows')).
// The segmentation engine evaluates more attributes, but they belong to other products (dunning/
// reactivation) and the cancel-flow builder can't render them, so the API rejects out-of-palette
// built-ins. Org-defined custom attributes are still accepted.
const SEGMENT_ATTRIBUTE_CATALOG = [
  'Targeting attribute. Call list_segment_attributes for the supported list (with the exact allowed `values` for enum attributes) plus your org-specific custom attributes. The built-in attributes available for cancel flow segments are:',
  '• Text/ID (operand INCLUDES or NOT_INCLUDES, value is a list): CUSTOMER_EMAIL, PLAN_ID, PRODUCT_ID, CURRENCY, BILLING_INTERVAL (DAY/WEEK/MONTH/YEAR), SUBSCRIPTION_STATUS (ACTIVE/TRIALING/PAST_DUE), SUBSCRIPTION_DISCOUNT (ONCE/REPEATING/FOREVER).',
  '• Number (operand GT/LT/GTE/LTE/BETWEEN/NOT_BETWEEN): PRICE (major currency units, e.g. dollars, not cents), BILLING_INTERVAL_COUNT, SUBSCRIPTION_AGE_MONTHS.',
  '• Date as an ISO-8601 string (operand GT/LT/GTE/LTE/BETWEEN/NOT_BETWEEN): SUBSCRIPTION_START_DATE.',
  '• Boolean (operand INCLUDES with value [true] or [false]): CANCEL_FLOW_WILL_SHOW_CLICK_TO_CANCEL.',
  'Fixed-enum attributes (BILLING_INTERVAL, SUBSCRIPTION_STATUS, SUBSCRIPTION_DISCOUNT) require their exact dashboard value (e.g. "MONTH", not "month") and the set can be provider-specific — call list_segment_attributes for the exact `values` allowed for this org.',
  'Built-in attributes scoped to other products (e.g. CUSTOMER_HAS_PHONE, INVOICE_AMOUNT_DUE, SURVEY_CHOICE) are rejected for cancel flow segments. You may also pass any custom customer attribute your org has defined (see list_segment_attributes).',
].join('\n')

const filterRule = z
  .object({
    attribute: z.string().min(1).describe(SEGMENT_ATTRIBUTE_CATALOG),
    operand: z
      .enum(SEGMENT_OPERANDS)
      .describe('Comparison operand. EQUAL/NOT_EQUAL are NOT supported — use INCLUDES/NOT_INCLUDES.'),
    value: z
      .array(z.unknown())
      .describe(
        'Comparison value(s). BETWEEN/NOT_BETWEEN need exactly 2; GT/LT/GTE/LTE need 1; INCLUDES/NOT_INCLUDES is a list.',
      ),
    type: z
      .enum(['STRING', 'NUMBER', 'BOOLEAN', 'DATE'])
      .optional()
      .describe('Value type. Usually preserve what list_segments returned for this attribute.'),
  })
  .strict()
  .refine((rule) => !['BETWEEN', 'NOT_BETWEEN'].includes(rule.operand) || rule.value.length === 2, {
    message: 'value must have exactly 2 entries for BETWEEN/NOT_BETWEEN.',
  })

const updateFilterInput = z.object({
  segmentId: z.string().describe('Churnkey segment ID. Use list_segments first if you do not know it.'),
  filter: z
    .array(filterRule)
    .describe(
      'Complete replacement set of audience rules (whole-array replace; include every rule to keep). Pass [] to clear all rules.',
    ),
  confirm: z
    .literal('update_segment_filter')
    .describe(
      'Required confirmation. Editing the filter changes which customers the flow targets; pass exactly "update_segment_filter".',
    ),
  confirmLiveChange: z
    .boolean()
    .optional()
    .describe(
      'Extra acknowledgment required only when the target segment is currently live (enabled AND published): editing its audience changes which customers see the flow immediately. The API rejects the edit with an instruction to re-send with confirmLiveChange: true. Omit (or false) for disabled/unpublished segments.',
    ),
})

const createSegmentFlowInput = z.object({
  segment: z
    .object({
      name: z.string().optional().describe('Segment display name. Defaults to "New Segment".'),
      enabled: z.boolean().optional().describe('Whether the segment starts enabled. Defaults to true.'),
      filter: z
        .array(filterRule)
        .optional()
        .describe(
          'Initial complete audience filter rules. Defaults to [] so the segment matches no specific audience rules until configured.',
        ),
    })
    .strict()
    .optional()
    .describe('Segment metadata and audience rules.'),
  blueprint: z
    .object({
      template: z
        .enum(['empty', 'BASIC', 'B2B', 'MERGEFIELDS'])
        .optional()
        .describe(
          'Initial draft template. Defaults to "empty"; BASIC/B2B/MERGEFIELDS prepopulate cancel-flow steps and survey choices.',
        ),
      name: z.string().optional().describe('Blueprint display name.'),
      brandImage: z
        .string()
        .optional()
        .describe('Brand image URL. The API accepts raster URLs and images.churnkey.co assets.'),
      primaryColor: z.string().optional().describe('Primary hex color for the flow, e.g. "#F7B200".'),
      translatedLanguages: z
        .array(z.string())
        .optional()
        .describe('Locale keys already translated for this blueprint. Usually omit.'),
    })
    .strict()
    .optional()
    .describe('Draft blueprint metadata and optional template.'),
  confirm: z
    .literal('create_segment_flow')
    .describe(
      'Required confirmation. Creating a segment flow changes cancel-flow configuration; pass exactly "create_segment_flow".',
    ),
})

const archiveSegmentInput = z.object({
  segmentId: z.string().describe('Churnkey segment ID. Use list_segments first if you do not know it.'),
  confirm: z
    .literal('archive_segment')
    .describe(
      'Required confirmation. Archiving hides the segment flow from live inventory; pass exactly "archive_segment".',
    ),
})

export function segmentTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'list_segments',
      title: 'List cancel flow segments',
      description: [
        'List cancel flow segment metadata for the authenticated org in priority order (the response order IS the priority — first = highest priority; the 0-based `priority` field mirrors it). Includes disabled segments (each has an `enabled` boolean). Each segment also returns its audience `filter` rules ([{ attribute, operand, value }]) so you can reason about which customers a flow targets.',
        '',
        'A/B test variant segments appear as separate top-level entries here (the dashboard folds them under their parent test). Unfinished A/B test segments cannot be archived, enabled/disabled, or have their audience edited, and reorder_segments must keep test pairs together.',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/segments'),
    },
    {
      name: 'list_segment_attributes',
      title: 'List segment audience filter attributes',
      description: [
        'List the audience-filter attributes you can target with update_segment_filter (and the segment.filter field of create_segment_flow). Returns two groups:',
        '- `builtIn`: the attributes available for cancel flow segments (the cancel-flow palette, mirroring the dashboard), each with its `valueType` (STRING/NUMBER/DATE/BOOLEAN) and the `operands` that apply. Fixed-enum attributes (e.g. BILLING_INTERVAL, SUBSCRIPTION_STATUS, SUBSCRIPTION_DISCOUNT) also include a `values` array of `{ value, label }` — use the exact `value` (provider-specific). Built-in attributes scoped to other products (e.g. CUSTOMER_HAS_PHONE, INVOICE_AMOUNT_DUE) are not included and are rejected by update_segment_filter.',
        "- `custom`: your organization's own custom customer attributes (by `attribute` name, with `label`, `valueType`, and `operands`).",
        '',
        'Use this before update_segment_filter so you target real attributes with valid operands. STRING/BOOLEAN use INCLUDES/NOT_INCLUDES; NUMBER/DATE use GT/LT/GTE/LTE/BETWEEN/NOT_BETWEEN. Numeric money attributes (PRICE, INVOICE_AMOUNT_DUE) are compared in major currency units (e.g. dollars, not cents); dates are ISO-8601 strings.',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/segments/attributes'),
    },
    {
      name: 'create_segment_flow',
      title: 'Create a cancel flow segment draft',
      description: [
        'Create a new cancel-flow segment and its editable draft blueprint in one call. Use this for isolated setup/testing flows: pass `blueprint.template` as "empty", "BASIC", "B2B", or "MERGEFIELDS". The new flow is setup-pending until publish_blueprint is called.',
        '',
        'The segment can be created with an empty filter for setup, but publish_blueprint and enabling both require at least one audience filter rule. A new segment flow is enabled by default (pass segment.enabled: false to create it paused); publishing makes the blueprint live but does not change the segment’s enabled state, mirroring the dashboard — use set_segment_enabled to toggle targeting. Use update_segment_filter before publishing if the filter is empty, or archive_segment to clean up a disposable test segment.',
      ].join('\n'),
      inputSchema: createSegmentFlowInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      handler: async (args) => client.post('/data/segments', { body: args }),
    },
    {
      name: 'reorder_segments',
      title: 'Reorder cancel flow segments',
      description:
        'Reorder cancel flow segment priority. This is a live-impacting configuration change, so it requires explicit confirmation and records an audit log. If an unfinished A/B test is involved, include both test segments together and keep the control immediately followed by its variant, matching the dashboard grouping.',
      inputSchema: reorderInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      handler: async (args) => client.post('/data/segments/reorder', { body: args }),
    },
    {
      name: 'archive_segment',
      title: 'Archive a cancel flow segment',
      description:
        'Soft-delete/archive a cancel-flow segment so it disappears from the non-deleted segment inventory. Use this to clean up disposable segment flows created for testing. Segments in unfinished A/B tests cannot be archived. Requires explicit confirmation and records an audit log.',
      inputSchema: archiveSegmentInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/segments/${args.segmentId}/archive`, {
          body: { confirm: args.confirm },
        }),
    },
    {
      name: 'set_segment_enabled',
      title: 'Enable or disable a cancel flow segment',
      description:
        'Enable or disable a cancel flow segment. Disabling stops its flow from being served to matching customers (the segment becomes inactive); enabling resumes it and requires at least one audience filter rule. Segments in unfinished A/B tests cannot be enabled or disabled through this tool. This is a live-impacting configuration change, so it requires explicit confirmation and records an audit log. Use list_segments first to get the segment ID, current enabled state, and filter.',
      inputSchema: setEnabledInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/segments/${args.segmentId}/enabled`, {
          body: { enabled: args.enabled, confirm: args.confirm },
        }),
    },
    {
      name: 'update_segment_filter',
      title: 'Update a cancel flow segment audience filter',
      description: [
        'Replace the audience filter rules for a cancel flow segment. This sends the COMPLETE new filter array and fully replaces the existing rules (it is not an add/remove patch) — include every rule you want to keep. If the segment is live (enabled AND published), editing its audience changes targeting immediately, so the API requires an extra acknowledgment: re-send with confirmLiveChange: true. Segments in unfinished A/B tests cannot have their audience edited.',
        '',
        'Each rule is { attribute, operand, value, type? }. operand is one of INCLUDES, GT, LT, GTE, LTE, BETWEEN, NOT_INCLUDES, NOT_BETWEEN. For BETWEEN/NOT_BETWEEN, value has exactly two entries [low, high]; for GT/LT/GTE/LTE, one entry; for INCLUDES/NOT_INCLUDES, the list of matching values. See the `attribute` field for the catalog of built-in targeting attributes and which operands apply to each (custom customer attributes are also accepted). Call list_segments first to read the current rules.',
      ].join('\n'),
      inputSchema: updateFilterInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/segments/${args.segmentId}/filter`, {
          body: { filter: args.filter, confirm: args.confirm, confirmLiveChange: args.confirmLiveChange },
        }),
    },
  ]
}
