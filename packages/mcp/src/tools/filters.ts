import { z } from 'zod'

// Mirrors OFFER_TYPE_LIST in churnkey-api (src/helpers/shared.js).
// Keep the two in sync if new offer types are added.
export const OFFER_TYPE_VALUES = [
  'PAUSE',
  'DISCOUNT',
  'CONTACT',
  'PLAN_CHANGE',
  'REDIRECT',
  'TRIAL_EXTENSION',
  'CUSTOM',
] as const

// `saveType` is derived: null when canceled, otherwise the accepted offerType,
// otherwise 'ABANDON' (customer left without deciding).
export const SAVE_TYPE_VALUES = [...OFFER_TYPE_VALUES, 'ABANDON'] as const

export const BILLING_INTERVAL_VALUES = ['day', 'week', 'month', 'year'] as const

// Breakdown dimensions accepted by /v1/data/warehouse/session-aggregation. Time
// dimensions (day/week/month) produce time series; combine with attribute
// dimensions to break a series down further.
export const BREAKDOWN_VALUES = [
  'day',
  'week',
  'month',
  'saveType',
  'offerType',
  'response',
  'aborted',
  'canceled',
  'trial',
  'segmentId',
  'abtest',
  'planId',
  'billingInterval',
  'couponId',
  'pauseDuration',
  'sessionCurrency',
  'bounced',
  'ageMonths',
  'ageQuarters',
  'ageYears',
  'cooldownProjection',
] as const

const dateRange = {
  startDate: z
    .string()
    .optional()
    .describe(
      'Inclusive lower bound on session createdAt. ISO 8601 date or datetime, e.g. "2026-01-01" or "2026-01-01T00:00:00Z".',
    ),
  endDate: z.string().optional().describe('Inclusive upper bound on session createdAt. ISO 8601 date or datetime.'),
}

const filterShape = {
  sessionId: z.string().optional().describe('Single Churnkey session ID. Returns the matching session only.'),
  customerEmail: z
    .string()
    .optional()
    .describe('Customer email (exact match). Use this to look up all sessions for one customer.'),
  customerId: z
    .string()
    .optional()
    .describe('Customer ID as it was passed from the merchant (matches customer.id). Exact match.'),
  segmentId: z.string().optional().describe('Filter to sessions that matched a specific segment.'),
  abtest: z.string().optional().describe('Filter to sessions that ran a specific A/B test (test ID).'),
  saveType: z
    .enum(SAVE_TYPE_VALUES)
    .optional()
    .describe(
      'Outcome bucket. ABANDON = customer left without deciding. Null in the response means the cancel went through. One of the OFFER_TYPE values means the customer accepted that offer.',
    ),
  offerType: z
    .enum(OFFER_TYPE_VALUES)
    .optional()
    .describe('The type of offer the customer accepted (only set on saved sessions).'),
  response: z
    .string()
    .optional()
    .describe('Survey choice value the customer selected (e.g. "TOO_EXPENSIVE", "MISSING_FEATURE"). Free text.'),
  aborted: z.boolean().optional().describe('Customer closed the flow without completing it.'),
  canceled: z.boolean().optional().describe('Customer fully canceled their subscription.'),
  trial: z.boolean().optional().describe('Customer was on trial when the session started.'),
  bounced: z
    .boolean()
    .optional()
    .describe(
      'Whether the session bounced (loaded but did not interact). Default API behavior excludes bounced sessions; set explicitly to include or exclude.',
    ),
  planId: z.string().optional().describe('Customer plan/price ID at session start.'),
  billingInterval: z.enum(BILLING_INTERVAL_VALUES).optional().describe('Billing interval at session start.'),
  couponId: z.string().optional().describe('Coupon ID applied as part of the accepted offer.'),
  pauseDuration: z.number().int().optional().describe('Pause duration (months) on the accepted pause offer.'),
  sessionCurrency: z.string().optional().describe('Customer currency at session start (ISO 4217, e.g. "usd", "eur").'),
  ageYears: z.number().int().optional().describe('Customer account age in years at session start.'),
}

export const sharedFilterFields = {
  ...dateRange,
  ...filterShape,
  not: z
    .object(filterShape)
    .optional()
    .describe(
      'Exclusion filters. Each key matches "not equal" instead of equal. Example: { saveType: "ABANDON" } returns only saved sessions.',
    ),
}

interface BuildQueryArgs {
  not?: Record<string, unknown>
  breakdownBy?: readonly string[]
  [k: string]: unknown
}

// Convert the structured tool input into the flat query-string shape the
// underlying /v1/data/warehouse/* endpoints expect: nested `not` keys become `-key`,
// and `breakdownBy` arrays are joined with `-`.
export function buildQuery(args: BuildQueryArgs): Record<string, unknown> {
  const { not, breakdownBy, ...rest } = args

  const query: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined || v === null) continue
    query[k] = v
  }

  if (not) {
    for (const [k, v] of Object.entries(not)) {
      if (v === undefined || v === null) continue
      query[`-${k}`] = v
    }
  }

  if (breakdownBy && breakdownBy.length > 0) {
    query.breakdown = breakdownBy.join('-')
  }

  return query
}
