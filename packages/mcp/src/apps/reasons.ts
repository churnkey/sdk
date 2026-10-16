import type { ChurnkeyClient } from '../client'
import type { CancelReason, CancelReasons, OutcomeCounts } from './dashboard-types'

// "Why they cancel": the survey answer each customer picked in the cancel flow,
// with its save rate and a few of the customers' own words. The counts come from
// the warehouse aggregation (breakdown by survey response), the quotes from one
// page of recent sessions grouped in-process.

// Answers past this fold into "Other" so the panel stays readable.
const MAX_REASONS = 6
const QUOTES_PER_REASON = 3
// One page of recent sessions is enough to find a few comments per answer
// without pulling the whole window.
const QUOTE_SESSIONS = 200
const MAX_QUOTE_LENGTH = 180
const MIN_QUOTE_LENGTH = 12

export const NO_ANSWER = 'No answer'
export const OTHER = 'Other'

interface ResponseRow {
  count: number | string
  response?: string | null
  saveType?: string | null
}

interface SessionRow {
  surveyChoiceValue?: string | null
  feedback?: string | null
  followupResponse?: string | null
}

function bucket(saveType: string | null | undefined): keyof OutcomeCounts {
  if (saveType == null) return 'canceled'
  return saveType === 'ABANDON' ? 'abandoned' : 'saved'
}

const key = (value: string | null | undefined) => (value ?? '').trim()

// Free text from customers can carry contact details; the panel and the model
// only need the sentiment.
export function cleanQuote(text: string): string | null {
  const flat = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
  if (flat.length < MIN_QUOTE_LENGTH) return null
  return flat.length > MAX_QUOTE_LENGTH ? `${flat.slice(0, MAX_QUOTE_LENGTH - 1).trimEnd()}…` : flat
}

export function groupQuotes(sessions: SessionRow[]): Map<string, string[]> {
  const byReason = new Map<string, string[]>()
  for (const s of sessions) {
    const raw = key(s.feedback) || key(s.followupResponse)
    if (!raw) continue
    const quote = cleanQuote(raw)
    if (!quote) continue
    const reason = key(s.surveyChoiceValue)
    const list = byReason.get(reason) ?? []
    if (list.length < QUOTES_PER_REASON && !list.includes(quote)) list.push(quote)
    byReason.set(reason, list)
  }
  return byReason
}

export function summarizeReasons(rows: ResponseRow[], quotes: Map<string, string[]>): CancelReasons | null {
  const counts = new Map<string, OutcomeCounts>()
  for (const row of rows) {
    const reason = key(row.response)
    const c = counts.get(reason) ?? { saved: 0, canceled: 0, abandoned: 0 }
    c[bucket(row.saveType)] += Number(row.count) || 0
    counts.set(reason, c)
  }
  const sum = (c: OutcomeCounts) => c.saved + c.canceled + c.abandoned
  const total = [...counts.values()].reduce((n, c) => n + sum(c), 0)
  if (total === 0) return null

  // Answered reasons rank by volume; "No answer" is shown last, since it says
  // nothing about why.
  const answered = [...counts.entries()].filter(([r]) => r !== '').sort(([, a], [, b]) => sum(b) - sum(a))
  const top = answered.slice(0, MAX_REASONS)
  const rest = answered.slice(MAX_REASONS)

  const row = (reason: string, kind: CancelReason['kind'], c: OutcomeCounts, q: string[]): CancelReason => {
    const n = sum(c)
    return { reason, kind, total: n, share: n / total, saveRate: n > 0 ? c.saved / n : null, quotes: q }
  }
  const result = top.map(([reason, c]) => row(reason, 'answer', c, quotes.get(reason) ?? []))
  if (rest.length > 0) {
    const merged = rest.reduce(
      (acc, [, c]) => ({
        saved: acc.saved + c.saved,
        canceled: acc.canceled + c.canceled,
        abandoned: acc.abandoned + c.abandoned,
      }),
      { saved: 0, canceled: 0, abandoned: 0 },
    )
    result.push(row(OTHER, 'other', merged, []))
  }
  const none = counts.get('')
  if (none && sum(none) > 0) result.push(row(NO_ANSWER, 'none', none, []))
  // Nothing but unanswered sessions means the flow has no survey; hide the panel.
  return result.some((r) => r.kind === 'answer') ? { total, rows: result } : null
}

export async function loadCancelReasons(
  client: ChurnkeyClient,
  range: { startDate: string; endDate: string },
  segmentId: string | undefined,
): Promise<CancelReasons | null> {
  // Each call fails on its own: a token without session read scope still gets
  // the counts, and a warehouse hiccup hides the panel instead of the dashboard.
  const [rows, sessions] = await Promise.all([
    client
      .get<ResponseRow[]>('/data/warehouse/session-aggregation', {
        query: { ...range, segmentId, breakdown: 'response-saveType' },
      })
      .catch(() => null),
    client
      .get<SessionRow[]>('/data/warehouse/sessions', { query: { ...range, segmentId, limit: QUOTE_SESSIONS } })
      .catch(() => null),
  ])
  if (!Array.isArray(rows)) return null
  return summarizeReasons(rows, groupQuotes(Array.isArray(sessions) ? sessions : []))
}
