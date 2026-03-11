// Phase 4: Outcome recording

export interface OutcomeParams {
  sessionId: string
  outcome: 'saved' | 'cancelled'
  reasonId: string
  decisionId?: string
  feedback?: string
  offersPresented: string[]
  offersDeclined: string[]
}

export async function recordOutcome(_params: OutcomeParams): Promise<void> {
  // Phase 4: POST outcome to Churnkey API
  // await fetch('https://api.churnkey.co/v1/data/cancel-sessions/outcome', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(params),
  // })
}
