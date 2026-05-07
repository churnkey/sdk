import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import { buildQuery } from './filters'
import type { ToolDefinition } from './types'

// Breakdown dimensions accepted by /v1/data/warehouse/recovery-aggregation. Time
// dimensions (day/week/month) bucket on the failed-payment created date.
const BREAKDOWN_VALUES = [
  'day',
  'week',
  'month',
  'recovered',
  'active',
  'cardBrand',
  'failReason',
  'outcome',
  'campaignBlueprintId',
  'currency',
] as const

const filterShape = {
  customerEmail: z
    .string()
    .optional()
    .describe(
      'Customer email (exact match, case-insensitive). Use this to look up recovery attempts for one customer.',
    ),
  recovered: z
    .boolean()
    .optional()
    .describe(
      'Whether the failed payment was successfully recovered. False matches campaigns still pending or already lost.',
    ),
  active: z
    .boolean()
    .optional()
    .describe(
      'Whether the recovery campaign is still in flight. False means the campaign has settled (recovered or lost).',
    ),
  trial: z.boolean().optional().describe('Whether the payment failed during a trial.'),
  inherited: z
    .boolean()
    .optional()
    .describe('Whether the campaign was inherited from an earlier failed payment for the same customer.'),
  campaignBlueprintId: z.string().optional().describe('Campaign blueprint ID that ran for this recovery.'),
  cardBrand: z.string().optional().describe('Card brand on the failed payment (e.g. "visa", "mastercard", "amex").'),
  failReason: z
    .string()
    .optional()
    .describe(
      'Stripe-style decline reason on the failed payment (e.g. "insufficient_funds", "card_declined", "expired_card").',
    ),
  outcome: z.string().optional().describe('Final campaign outcome label. Free text; varies by configuration.'),
  currency: z
    .string()
    .optional()
    .describe('ISO 4217 currency of the failed payment (e.g. "usd", "eur"). Case-insensitive.'),
}

const sharedFilters = {
  startDate: z
    .string()
    .optional()
    .describe('Inclusive lower bound on the failed payment created date. ISO 8601 date or datetime.'),
  endDate: z
    .string()
    .optional()
    .describe('Inclusive upper bound on the failed payment created date. ISO 8601 date or datetime.'),
  ...filterShape,
  not: z
    .object(filterShape)
    .optional()
    .describe(
      'Exclusion filters. Each key matches "not equal" instead of equal. Example: { recovered: true } returns only pending or lost recoveries.',
    ),
}

const listInput = z.object({
  ...sharedFilters,
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50)
    .describe(
      'Max recoveries to return per call. Defaults to 50; capped at 500 to keep responses small for agent context. For totals, use aggregate_payment_recoveries.',
    ),
  skip: z.number().int().min(0).optional().describe('Pagination offset. Combine with limit to page through results.'),
})

const aggregateInput = z.object({
  ...sharedFilters,
  breakdownBy: z
    .array(z.enum(BREAKDOWN_VALUES))
    .optional()
    .describe(
      'Group counts and amounts by these dimensions. Multiple dimensions produce a cross-tab; e.g. ["month","recovered"] returns one row per (month, recovered) pair. Omit for a single grand total. Time dimensions: day, week, month.',
    ),
})

const WAREHOUSE_NOTE =
  'Data source: the Churnkey analytics warehouse, refreshed roughly every 20 minutes. Recoveries from the last few minutes may not appear yet.'

const AMOUNT_NOTE =
  'Amount fields come back in two forms: original currency (`invoiceAmount`, `recoveredAmount`, `pendingAmount`, `lostAmount`) and USD (suffix `Usd`). Original-currency totals only make sense when filtered or grouped by a single currency; USD totals are safe to sum across currencies.'

export function recoveryTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'list_payment_recoveries',
      title: 'List failed-payment recoveries',
      description: [
        'List individual failed-payment recovery campaigns. Each row covers one failed payment plus the campaign Churnkey ran (or is running) to recover it.',
        '',
        'Use this for inspection (e.g. "show me the 10 most recent failed payments where we lost money") or per-customer lookup. For volume or rate questions, prefer aggregate_payment_recoveries.',
        '',
        WAREHOUSE_NOTE,
      ].join('\n'),
      inputSchema: listInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) => client.get('/data/warehouse/recoveries', { query: buildQuery(args) }),
    },
    {
      name: 'aggregate_payment_recoveries',
      title: 'Aggregate failed-payment recoveries',
      description: [
        'Aggregate counts and dollar amounts for failed-payment recovery campaigns (dunning). Each underlying row is one failed payment and the campaign attached to it.',
        '',
        'Returned metrics per group: `count`, `invoiceAmount(Usd)`, `recoveredCount`, `recoveredAmount(Usd)`, `pendingCount`, `pendingAmount(Usd)`, `lostCount`, `lostAmount(Usd)`. Recovered = succeeded; pending = still in flight; lost = campaign ended without recovery.',
        '',
        'Examples:',
        '- breakdownBy: [] → grand totals (recovery rate = recoveredCount / count)',
        '- breakdownBy: ["month"] → monthly time series',
        '- breakdownBy: ["failReason"] → which decline reasons we recover from best',
        '- breakdownBy: ["cardBrand","recovered"] → recovery rate by card brand',
        '',
        AMOUNT_NOTE,
        '',
        WAREHOUSE_NOTE,
      ].join('\n'),
      inputSchema: aggregateInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) => client.get('/data/warehouse/recovery-aggregation', { query: buildQuery(args) }),
    },
  ]
}
