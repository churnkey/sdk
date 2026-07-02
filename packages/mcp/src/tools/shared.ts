import { z } from 'zod'

// Short-form write-confirmation guard shared by the tool definitions. A mutating
// tool gates its write behind `confirm: confirmLiteral('<token>')`, forcing the
// caller to echo the exact token. The generic preserves the literal token type at
// each call site. Tools that need contextual confirmation guidance keep an inline
// z.literal/z.string with their own describe text rather than routing through this.
export const confirmLiteral = <T extends string>(token: T) =>
  z.literal(token).describe('Required confirmation literal.')

// Appended (by server.ts) to the description of mode-scoped tools so the agent
// knows the result/effect belongs to one mode. Two flavors: data reads vs
// live-traffic actions. Configuration tools are mode-agnostic and get neither.
export const MODE_DATA_NOTE =
  "Mode-scoped: returns data for this session's current mode only — live unless test mode is selected (default is live). Configuration is shared across live/test, but runtime data like this is not. Call get_account to confirm the active mode."
export const MODE_TRAFFIC_NOTE =
  "Mode-scoped: acts in this session's current mode — live unless test mode is selected (default is live) — so it affects real customer traffic/sends in that mode. Call get_account to confirm the active mode before running this against live customers."
