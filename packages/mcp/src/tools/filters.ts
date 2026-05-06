import { z } from 'zod'

/**
 * Mirrors src/helpers/shared.js OFFER_TYPE_LIST in churnkey-api.
 * Keep in sync if new offer types are added there.
 */
export const OFFER_TYPE_VALUES = [
  'PAUSE',
  'DISCOUNT',
  'CONTACT',
  'PLAN_CHANGE',
  'REDIRECT',
  'TRIAL_EXTENSION',
  'CUSTOM',
] as const

/**
 * `saveType` is derived: null when canceled=true, otherwise the offerType the
 * customer accepted, or 'ABANDON' if the session ended without a decision.
 */
export const SAVE_TYPE_VALUES = [...OFFER_TYPE_VALUES, 'ABANDON'] as const

/** Common Stripe billing intervals. Other values pass through as strings. */
export const BILLING_INTERVAL_VALUES = ['day', 'week', 'month', 'year'] as const

/**
 * Breakdown dimensions accepted by /v1/data/session-aggregation.
 * Time dimensions (day/week/month/invoiceMonth) produce time series;
 * combine with attribute dimensions to break a series down further.
 */
export const BREAKDOWN_VALUES = [
  'day',
  'week',
  'month',
  'invoiceMonth',
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
  'currency',
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

/** Filters supported by both list_sessions and aggregate_sessions. */
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

/** Negation versions of the same filters — pass "not: { saveType: 'DISCOUNT' }" etc. */
const notShape = {
  sessionId: filterShape.sessionId,
  customerEmail: filterShape.customerEmail,
  customerId: filterShape.customerId,
  segmentId: filterShape.segmentId,
  abtest: filterShape.abtest,
  saveType: filterShape.saveType,
  offerType: filterShape.offerType,
  response: filterShape.response,
  aborted: filterShape.aborted,
  canceled: filterShape.canceled,
  trial: filterShape.trial,
  bounced: filterShape.bounced,
  planId: filterShape.planId,
  billingInterval: filterShape.billingInterval,
  couponId: filterShape.couponId,
  pauseDuration: filterShape.pauseDuration,
  sessionCurrency: filterShape.sessionCurrency,
  ageYears: filterShape.ageYears,
}

export const sharedFilterFields = {
  ...dateRange,
  ...filterShape,
  not: z
    .object(notShape)
    .partial()
    .optional()
    .describe(
      'Exclusion filters. Each key is the same as the top-level filter but matches "not equal" instead. Example: { saveType: "ABANDON" } returns only saved sessions.',
    ),
}

/**
 * Convert structured input ({ saveType, not: { canceled }, breakdownBy }) into the
 * flat query-string shape the API expects ({ saveType, '-canceled', breakdown }).
 */
export function buildQuery(args: Record<string, unknown>): Record<string, unknown> {
  const { not, breakdownBy, ...rest } = args as {
    not?: Record<string, unknown>
    breakdownBy?: readonly string[]
    [k: string]: unknown
  }

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
