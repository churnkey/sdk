import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import { BREAKDOWN_VALUES, buildQuery, sharedFilterFields } from './filters'
import type { ToolDefinition } from './types'

const listSessionsInput = z.object({
  ...sharedFilterFields,
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe(
      'Max sessions to return per call. Defaults to 50; capped at 500 to keep responses small for agent context. For totals, use aggregate_sessions instead — it does not load session documents.',
    ),
  skip: z.number().int().min(0).optional().describe('Pagination offset. Combine with limit to page through results.'),
})

const aggregateSessionsInput = z.object({
  ...sharedFilterFields,
  breakdownBy: z
    .array(z.enum(BREAKDOWN_VALUES))
    .optional()
    .describe(
      'Group counts by these dimensions. Multiple dimensions produce a cross-tab; e.g. ["month","saveType"] returns one row per (month, saveType) pair. Omit for a single grand total. Time dimensions: day, week, month, invoiceMonth.',
    ),
})

const apiUsageInput = z.object({
  startDate: z.string().optional().describe('Inclusive lower bound. ISO 8601 date or datetime.'),
  endDate: z.string().optional().describe('Inclusive upper bound. ISO 8601 date or datetime.'),
})

export function sessionTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'list_sessions',
      title: 'List Churnkey sessions',
      description: [
        'List individual cancel/dunning sessions for the org. Each session is one customer interaction with a retention flow.',
        '',
        'Filters: scope by date (startDate/endDate), customer (customerEmail/customerId), outcome (saveType/offerType/canceled/aborted/trial), or attributes (planId/billingInterval/segmentId/abtest). Use the `not` object to exclude values.',
        '',
        'Use this when you need session-level detail (e.g. "show me the 10 most recent sessions where a discount was offered"). For counts and breakdowns, prefer aggregate_sessions — it ships less data.',
        '',
        'Mode (live vs test) is determined by the API key prefix; pass a `test_`-prefixed key in your MCP server env to query test data.',
      ].join('\n'),
      inputSchema: listSessionsInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) => client.get('/data/sessions', { query: buildQuery(args) }),
    },
    {
      name: 'aggregate_sessions',
      title: 'Aggregate session counts',
      description: [
        'Count sessions, optionally grouped by one or more dimensions. This is the primary stats query — use it before list_sessions when answering volume, breakdown, or trend questions.',
        '',
        'Examples:',
        '- breakdownBy: [] → single total count',
        '- breakdownBy: ["saveType"] → counts by outcome bucket',
        '- breakdownBy: ["month","saveType"] → monthly time series broken down by outcome',
        '- breakdownBy: ["planId"], filter not: { canceled: true } → saved-session counts per plan',
        '',
        'Filters work the same as list_sessions.',
      ].join('\n'),
      inputSchema: aggregateSessionsInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) => client.get('/data/session-aggregation', { query: buildQuery(args) }),
    },
    {
      name: 'get_api_usage',
      title: 'Get Churnkey API usage',
      description:
        'Return Churnkey API call volume for the org over a date range. Useful for confirming the embed/SDK is firing in production, or diagnosing a sudden drop in tracked sessions.',
      inputSchema: apiUsageInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) => client.get('/data/api-usage', { query: args }),
    },
  ]
}
