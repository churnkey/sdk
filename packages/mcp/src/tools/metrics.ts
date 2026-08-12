import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const flowMetricsInput = z.object({
  segmentId: z
    .string()
    .optional()
    .describe(
      'Scope to one segment flow (from list_segments). Omit together with blueprintId/abtestId for org-wide metrics.',
    ),
  blueprintId: z
    .string()
    .optional()
    .describe(
      'Scope to one PUBLISHED blueprint version (publishedBlueprintId from list_blueprints, or an entry from get_blueprint versions). Each publish creates a new published blueprint, so this gives per-version metrics — compare two versions by calling this tool twice.',
    ),
  abtestId: z.string().optional().describe('Scope to one A/B test (sessions enrolled in that test).'),
  startDate: z.string().optional().describe('ISO date lower bound, e.g. "2026-01-01". Defaults to all time.'),
  endDate: z.string().optional().describe('ISO date upper bound.'),
})

export function metricsTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'get_flow_metrics',
      title: 'Get cancel flow performance metrics',
      description: [
        'Performance metrics for a cancel flow (or the whole org): total sessions, customers saved, save rate, boosted revenue (USD + per-currency), session outcomes breakdown (saved by offer type / canceled / abandoned), and Feedback AI themes (Churnkey Intelligence plans).',
        '',
        'Scope by segmentId (one segment flow), blueprintId (one published version — call twice to compare versions or A/B branches), or abtestId. Add startDate/endDate to window the data.',
        '',
        'The response includes `sampleSizeWarning` when the window has too few sessions for conclusions — quote it instead of drawing inferences from small samples. `summary` is a one-line quotable digest. Some metrics (retention impact, reactivation rate) return structured not_available payloads.',
        '',
        'Data source: the Churnkey analytics warehouse (~3-hour refresh). Boosted revenue covers live mode only.',
      ].join('\n'),
      inputSchema: flowMetricsInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      handler: async (args) => {
        const { abtestId, ...rest } = args as { abtestId?: string } & Record<string, unknown>
        return client.get('/data/flow-metrics', { query: { ...rest, abtest: abtestId } })
      },
    },
  ]
}
