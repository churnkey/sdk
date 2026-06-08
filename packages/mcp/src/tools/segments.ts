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

const filterRule = z
  .object({
    attribute: z
      .string()
      .min(1)
      .describe('Targeting attribute, e.g. PLAN_ID, PRICE, SUBSCRIPTION_AGE_MONTHS. See list_segments for examples.'),
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
        'A/B test variant segments appear as separate top-level entries here (the dashboard folds them under their parent test), so treat segments cautiously when reordering. Use this before reorder_segments.',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/segments'),
    },
    {
      name: 'create_segment_flow',
      title: 'Create a cancel flow segment draft',
      description: [
        'Create a new cancel-flow segment and its editable draft blueprint in one call. Use this for isolated setup/testing flows: pass `blueprint.template` as "empty", "BASIC", "B2B", or "MERGEFIELDS". The new flow is setup-pending until publish_blueprint is called.',
        '',
        'The segment can be created with an empty filter for setup, but publish_blueprint and enabling both require at least one audience filter rule. On the first successful publish of a segment flow, the API enables the segment automatically. Use update_segment_filter before publishing if the filter is empty, or archive_segment to clean up a disposable test segment.',
      ].join('\n'),
      inputSchema: createSegmentFlowInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      handler: async (args) => client.post('/data/segments', { body: args }),
    },
    {
      name: 'reorder_segments',
      title: 'Reorder cancel flow segments',
      description:
        'Reorder cancel flow segment priority. This is a live-impacting configuration change, so it requires explicit confirmation and records an audit log.',
      inputSchema: reorderInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      handler: async (args) => client.post('/data/segments/reorder', { body: args }),
    },
    {
      name: 'archive_segment',
      title: 'Archive a cancel flow segment',
      description:
        'Soft-delete/archive a cancel-flow segment so it disappears from the non-deleted segment inventory. Use this to clean up disposable segment flows created for testing. Requires explicit confirmation and records an audit log.',
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
        'Enable or disable a cancel flow segment. Disabling stops its flow from being served to matching customers (the segment becomes inactive); enabling resumes it and requires at least one audience filter rule. This is a live-impacting configuration change, so it requires explicit confirmation and records an audit log. Use list_segments first to get the segment ID, current enabled state, and filter.',
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
        'Replace the audience filter rules for a cancel flow segment. This sends the COMPLETE new filter array and fully replaces the existing rules (it is not an add/remove patch) — include every rule you want to keep. This changes which customers the segment targets, so it is live-impacting, requires explicit confirmation, and records an audit log.',
        '',
        'Each rule is { attribute, operand, value, type? }. operand is one of INCLUDES, GT, LT, GTE, LTE, BETWEEN, NOT_INCLUDES, NOT_BETWEEN. For BETWEEN/NOT_BETWEEN, value has exactly two entries [low, high]; for GT/LT/GTE/LTE, one entry; for INCLUDES/NOT_INCLUDES, the list of matching values. Call list_segments first to read the current rules.',
      ].join('\n'),
      inputSchema: updateFilterInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/segments/${args.segmentId}/filter`, {
          body: { filter: args.filter, confirm: args.confirm },
        }),
    },
  ]
}
