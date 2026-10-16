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
  /** Cancel-flow analytics in the Churnkey web app, for "Open in Churnkey". */
  churnkeyUrl: string
  segments: Array<
    {
      id: string
      name: string
      enabled: boolean
      priority: number
      total: number
      saveRate: number | null
      /** The segment's cancel flow in the Churnkey builder, when it has a draft blueprint. */
      flowUrl: string | null
    } & OutcomeCounts
  >
  /** Survey answers for the window and scope; null when the flow has no survey or the data is unavailable. */
  reasons: CancelReasons | null
}

/** One survey answer in the "Why they cancel" panel. */
export interface CancelReason {
  /** The survey answer as customers saw it, or "No answer" / "Other". */
  reason: string
  kind: 'answer' | 'none' | 'other'
  total: number
  /** Share of all sessions in the window and scope. */
  share: number
  saveRate: number | null
  /** A few recent free-text comments from customers who picked this answer. */
  quotes: string[]
}

export interface CancelReasons {
  total: number
  rows: CancelReason[]
}

// ---------- offer changes (propose_offer_change / apply_offer_change) ----------

export const OFFER_CHANGE_TYPES = ['DISCOUNT', 'PAUSE', 'TRIAL_EXTENSION'] as const
export type OfferChangeType = (typeof OFFER_CHANGE_TYPES)[number]

/** The exact body apply_offer_change sends to POST /data/blueprints/:id/offer. */
export interface OfferChange {
  blueprintId: string
  stepGuid: string
  choiceGuid?: string
  offerType: OfferChangeType
  config: {
    couponId?: string
    autoOptimize?: boolean
    maxPauseLength?: number
    pauseInterval?: 'MONTH' | 'WEEK'
    trialExtensionDays?: number
  }
  header?: string
  description?: string
}

export interface OfferSummary {
  offerType: string
  /** Plain-language description, e.g. "Pause for up to 3 months". */
  text: string
  header: string | null
}

export interface OfferProposal {
  kind: 'offer-proposal'
  mode: 'live' | 'test'
  flow: { scope: 'org' | 'segment'; segmentId: string | null; name: string }
  /** Where the offer sits, e.g. 'Survey answer "Too expensive"' or 'Main offer'. */
  target: string
  before: OfferSummary | null
  after: OfferSummary
  rationale: string | null
  change: OfferChange
  /** The draft in the Churnkey builder, where the change is reviewed and published. */
  builderUrl: string
}
