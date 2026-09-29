import { readFileSync } from 'node:fs'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import {
  type DashboardData,
  type DashboardWindow,
  type FlowMetrics,
  type OutcomeCounts,
  WINDOWS,
} from './dashboard-types'

export type { DashboardData, DashboardWindow } from './dashboard-types'

// The Retention Dashboard is an MCP App (ext-apps `ui://` resource) plus the
// OpenAI plugin-extension metadata that lets ChatGPT open it without the model:
// a sidebar (global) entrypoint and a thread side-panel entrypoint. Hosts that
// don't speak MCP Apps ignore `_meta` and get the text summary instead, so the
// tool is still useful from Claude Code or Cursor.
//
// Spec: https://github.com/openai/mcp-extensions/blob/main/docs/spec.md

export const DASHBOARD_TOOL = 'open_retention_dashboard'
export const DASHBOARD_URI = 'ui://churnkey/retention-dashboard'
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app'

const WINDOW_DAYS: Record<DashboardWindow, number> = { '30d': 30, '90d': 90, '12m': 365 }

// A trend month with less data than this at the start of the window is a stub
// (a 30-day window ending on the 29th opens with two days of the previous
// month) and reads as a misleading bar, so the chart leaves it out.
const MIN_TREND_MONTH_DAYS = 7

// Segment rows are fetched in one aggregation, but the table only renders the
// busiest ones; past this the panel stops being readable.
const MAX_SEGMENT_ROWS = 12

const dashboardInput = z.object({
  window: z
    .enum(WINDOWS)
    .optional()
    .describe('Time window ending today: 30d, 90d (default) or 12m. The sidebar entrypoint opens with no arguments.'),
  segmentId: z
    .string()
    .optional()
    .describe('Scope the headline metrics to one segment flow (from list_segments). Omit for all cancel flows.'),
})

export type DashboardInput = z.infer<typeof dashboardInput>

interface CountRow {
  count: number | string
  saveType?: string | null
  month?: string
  segmentId?: string | null
}

interface Segment {
  id: string
  name: string
  enabled: boolean
  priority: number
}

interface Account {
  org?: { id: string; name?: string }
  mode?: string
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Warehouse rows use saveType = null for a cancel and 'ABANDON' for a
// walk-away; any other value is the offer that saved the customer. Mirrors
// composeFlowMetrics in churnkey-api so the chart and the headline agree.
function bucket(saveType: string | null | undefined): keyof OutcomeCounts {
  if (saveType == null) return 'canceled'
  return saveType === 'ABANDON' ? 'abandoned' : 'saved'
}

// Days of `month` (YYYY-MM) that fall on or after the window's start date.
function daysInWindow(month: string, startDate: string): number {
  const [y, m] = month.split('-').map(Number)
  const monthEnd = Date.UTC(y, m, 1)
  const from = Math.max(Date.UTC(y, m - 1, 1), Date.parse(`${startDate}T00:00:00Z`))
  return Math.max(0, Math.round((monthEnd - from) / 86_400_000))
}

// Leading months with under a week inside the window come off the chart, but never
// the last one: a chart with one short bar beats an empty one.
function dropLeadingStubs<T>(months: Array<[string, T]>, startDate: string): Array<[string, T]> {
  let i = 0
  while (i < months.length - 1 && daysInWindow(months[i][0], startDate) < MIN_TREND_MONTH_DAYS) i++
  return months.slice(i)
}

function emptyCounts(): OutcomeCounts {
  return { saved: 0, canceled: 0, abandoned: 0 }
}

function asRows(value: unknown): CountRow[] {
  return Array.isArray(value) ? (value as CountRow[]) : []
}

// ChatGPT deep links address a plugin by the id OpenAI assigns at publish time
// (https://chatgpt.com/plugins/<id>/app/<tool>?path=…), so sharing waits for it.
export function shareBase(env: NodeJS.ProcessEnv = process.env): string | null {
  const id = env.CHURNKEY_MCP_CHATGPT_PLUGIN_ID?.trim()
  return id ? `https://chatgpt.com/plugins/${encodeURIComponent(id)}/app/${DASHBOARD_TOOL}` : null
}

export async function loadDashboard(
  client: ChurnkeyClient,
  args: DashboardInput,
  now = new Date(),
): Promise<DashboardData> {
  const window = args.window ?? '90d'
  const start = new Date(now)
  if (window === '12m') {
    // Twelve calendar months including the current one, so the chart has no
    // two-day stub in front.
    start.setUTCDate(1)
    start.setUTCMonth(start.getUTCMonth() - 11)
  } else {
    start.setUTCDate(start.getUTCDate() - WINDOW_DAYS[window])
  }
  const startDate = isoDate(start)
  const endDate = isoDate(now)
  const range = { startDate, endDate }

  const [account, metrics, trendRows, segmentRows, segments] = await Promise.all([
    client.get<Account>('/data/account').catch(() => null),
    client.get<FlowMetrics>('/data/flow-metrics', { query: { ...range, segmentId: args.segmentId } }),
    client.get('/data/warehouse/session-aggregation', {
      query: { ...range, segmentId: args.segmentId, breakdown: 'month-saveType' },
    }),
    client.get('/data/warehouse/session-aggregation', { query: { ...range, breakdown: 'segmentId-saveType' } }),
    client.get<Segment[]>('/data/segments').catch(() => [] as Segment[]),
  ])

  const byMonth = new Map<string, OutcomeCounts>()
  for (const row of asRows(trendRows)) {
    if (!row.month) continue
    const counts = byMonth.get(row.month) ?? emptyCounts()
    counts[bucket(row.saveType)] += Number(row.count) || 0
    byMonth.set(row.month, counts)
  }

  const bySegment = new Map<string, OutcomeCounts>()
  for (const row of asRows(segmentRows)) {
    if (!row.segmentId) continue
    const counts = bySegment.get(row.segmentId) ?? emptyCounts()
    counts[bucket(row.saveType)] += Number(row.count) || 0
    bySegment.set(row.segmentId, counts)
  }

  const segmentTable = (Array.isArray(segments) ? segments : [])
    .map((segment) => {
      const counts = bySegment.get(segment.id) ?? emptyCounts()
      const total = counts.saved + counts.canceled + counts.abandoned
      return {
        id: segment.id,
        name: segment.name,
        enabled: segment.enabled,
        priority: segment.priority,
        ...counts,
        total,
        saveRate: total > 0 ? counts.saved / total : null,
      }
    })
    .sort((a, b) => b.total - a.total || a.priority - b.priority)
    .slice(0, MAX_SEGMENT_ROWS)

  return {
    org: account?.org ? { id: account.org.id, name: account.org.name ?? account.org.id } : null,
    mode: client.mode,
    window,
    startDate,
    endDate,
    segmentId: args.segmentId ?? null,
    metrics,
    trend: dropLeadingStubs(
      [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)),
      startDate,
    ).map(([month, counts]) => ({ month, ...counts })),
    segments: segmentTable,
    shareBase: shareBase(),
  }
}

// The UI bundle is built by scripts/build-app.mjs into dist/ next to the
// server entry points. Read lazily so importing the server (tests, the
// library entry) never depends on a built app.
let cachedHtml: string | undefined
function dashboardHtml(): string {
  if (cachedHtml !== undefined) return cachedHtml
  try {
    cachedHtml = readFileSync(new URL('./retention-dashboard.html', import.meta.url), 'utf8')
  } catch {
    cachedHtml =
      '<!doctype html><html><body><p>Retention Dashboard is not built. Run <code>pnpm build</code> in packages/mcp.</p></body></html>'
  }
  return cachedHtml
}

export function registerDashboard(server: McpServer, client: ChurnkeyClient): void {
  server.registerResource(
    'retention-dashboard',
    DASHBOARD_URI,
    {
      title: 'Churnkey Retention Dashboard',
      description: 'Interactive save-rate, outcome and segment view for Churnkey cancel flows.',
      mimeType: MCP_APP_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: DASHBOARD_URI,
          mimeType: MCP_APP_MIME_TYPE,
          text: dashboardHtml(),
          _meta: {
            // Everything is inlined and data arrives through tool calls, so the
            // iframe needs no network access at all.
            ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
            'openai/ui': { preferredDisplayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] },
          },
        },
      ],
    }),
  )

  server.registerTool(
    DASHBOARD_TOOL,
    {
      title: 'Retention Dashboard',
      description: [
        'Open the Churnkey Retention Dashboard: save rate, customers saved, boosted revenue, session outcomes by offer type, a monthly trend, and per-segment save rates for a time window.',
        '',
        'Hosts that support MCP Apps render it as an interactive view the user can filter and click into; others receive the same numbers as text. Use it when the user wants an overview or asks to "show" retention performance. For a single number, get_flow_metrics or aggregate_sessions are cheaper.',
        '',
        'Data source: the Churnkey analytics warehouse (~3-hour refresh). Boosted revenue covers live mode only.',
      ].join('\n'),
      inputSchema: dashboardInput.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      _meta: {
        ui: { resourceUri: DASHBOARD_URI },
        // Legacy flat key still read by older MCP Apps hosts.
        'ui/resourceUri': DASHBOARD_URI,
        'openai/ui': { entrypoints: [{ type: 'global' }, { type: 'thread' }] },
      },
    },
    async (args: unknown) => {
      try {
        const data = await loadDashboard(client, dashboardInput.parse(args ?? {}))
        return {
          structuredContent: data as unknown as Record<string, unknown>,
          content: [{ type: 'text' as const, text: textSummary(data) }],
        }
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
        }
      }
    },
  )
}

function pct(rate: number | null): string {
  return rate == null ? 'n/a' : `${(rate * 100).toFixed(1)}%`
}

export function textSummary(data: DashboardData): string {
  const lines = [
    `Retention Dashboard — ${data.org?.name ?? 'workspace'} (${data.mode.toUpperCase()} mode), ${data.startDate} to ${data.endDate}.`,
    data.metrics.summary,
  ]
  if (data.segments.length > 0) {
    lines.push('', 'Segments by volume:')
    for (const s of data.segments) {
      lines.push(`- ${s.name}${s.enabled ? '' : ' (disabled)'}: ${s.total} sessions, ${pct(s.saveRate)} saved`)
    }
  }
  return lines.join('\n')
}
