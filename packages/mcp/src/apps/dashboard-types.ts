// Shape of the open_retention_dashboard structured result. Kept free of
// runtime imports so the browser app (app/retention-dashboard) can share it.

export const WINDOWS = ['30d', '90d', '12m'] as const
export type DashboardWindow = (typeof WINDOWS)[number]

export interface FlowMetrics {
  totalSessions: number
  customersSaved: number
  saveRate: number | null
  boostedRevenueUSD: number
  averageBoostedRevenueUSD: number | null
  sessionOutcomes: {
    saved: { total: number; byOfferType: Record<string, number> }
    canceled: number
    abandoned: number
  }
  sampleSizeWarning: string | null
  summary: string
}

export interface OutcomeCounts {
  saved: number
  canceled: number
  abandoned: number
}

export interface DashboardData {
  org: { id: string; name: string } | null
  mode: 'live' | 'test'
  window: DashboardWindow
  startDate: string
  endDate: string
  segmentId: string | null
  metrics: FlowMetrics
  trend: Array<{ month: string } & OutcomeCounts>
  /**
   * Base of a ChatGPT deep link to this tool (`…/app/open_retention_dashboard`). The app appends
   * `?path=/segments/<id>?window=30d` to share the current view. Null until the server knows its
   * ChatGPT plugin id (CHURNKEY_MCP_CHATGPT_PLUGIN_ID), so no half-working link is offered.
   */
  shareBase: string | null
  segments: Array<
    {
      id: string
      name: string
      enabled: boolean
      priority: number
      total: number
      saveRate: number | null
    } & OutcomeCounts
  >
}
