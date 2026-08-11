import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import { confirmLiteral } from './shared'
import type { ToolDefinition } from './types'

const abTestId = z.string().describe('A/B test id (from list_ab_tests or create_ab_test).')

export function abTestTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'list_ab_tests',
      title: 'List A/B tests',
      description:
        "All cancel-flow A/B tests with lifecycle state (draft / enrolling / tracking / awaiting_decision / paused / completed / abandoned), hypothesis, primary metric, the two arm segment ids, winner + rationale, and cached final metrics for completed tests. Tests are two-arm with an implicit 50/50 split — traffic-split configuration and multivariate tests aren't supported.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/ab-tests'),
    },
    {
      name: 'create_ab_test',
      title: 'Create an A/B test from a segment flow',
      description: [
        'Clone an existing segment flow as the variant arm and link both arms into a new test. The test starts in DRAFT (not serving traffic): edit the variant (the response carries its editableBlueprintId — use update_blueprint_step / update_blueprint_offer), publish it, then start_ab_test.',
        '',
        'Configure hypothesis, primaryMetric (revenue_per_exposure default, or save_rate / pause_rate / discount_rate / reactivation_rate / ltv_extension), enrollment/tracking windows, and target confidence. Requires confirm: "create_ab_test".',
      ].join('\n'),
      inputSchema: z.object({
        confirm: confirmLiteral('create_ab_test'),
        segmentId: z.string().describe('Control segment (from list_segments) — must have a published flow.'),
        name: z.string().optional().describe('Display name for the test.'),
        hypothesis: z.string().optional().describe('What you expect to change and why — quoted back at decision time.'),
        primaryMetric: z
          .enum([
            'revenue_per_exposure',
            'save_rate',
            'pause_rate',
            'discount_rate',
            'reactivation_rate',
            'ltv_extension',
          ])
          .optional()
          .describe('The metric the decision should hinge on. Default revenue_per_exposure.'),
        enrollmentDays: z
          .number()
          .int()
          .min(7)
          .max(120)
          .optional()
          .describe('Enrollment window in days, 7 to 120 (default 7).'),
        trackingDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe('Post-enrollment tracking window (default 30).'),
        expectedSessions: z.number().int().min(1).optional().describe('Expected sessions, for sample-size planning.'),
        targetConfidence: z.number().min(0.5).max(0.999).optional().describe('Required confidence (default 0.95).'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      handler: async (args) => client.post('/data/ab-tests', { body: args }),
    },
    {
      name: 'start_ab_test',
      title: 'Start or resume an A/B test',
      description:
        'Start (or resume after a pause) an A/B test — live traffic starts splitting between the arms. Make sure the variant blueprint is published first. Requires confirm: "start_ab_test". Completed tests cannot restart (cohorts would mix) — create a new test instead.',
      inputSchema: z.object({
        confirm: confirmLiteral('start_ab_test'),
        abTestId,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const { abTestId: id, ...body } = args as { abTestId: string; confirm: string }
        return client.post(`/data/ab-tests/${encodeURIComponent(id)}/start`, { body })
      },
    },
    {
      name: 'pause_ab_test',
      title: 'Pause an A/B test',
      description:
        'Pause enrollment without deciding. Note: the enrollment window keeps elapsing while paused, shrinking the effective sample — long pauses weaken the test. Requires confirm: "pause_ab_test".',
      inputSchema: z.object({
        confirm: confirmLiteral('pause_ab_test'),
        abTestId,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const { abTestId: id, ...body } = args as { abTestId: string; confirm: string }
        return client.post(`/data/ab-tests/${encodeURIComponent(id)}/pause`, { body })
      },
    },
    {
      name: 'complete_ab_test',
      title: 'End an A/B test without a winner',
      description:
        'Stop the test without promoting either arm (e.g. inconclusive or abandoned). Both arms keep their current enabled state. Requires confirm: "complete_ab_test".',
      inputSchema: z.object({
        confirm: confirmLiteral('complete_ab_test'),
        abTestId,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const { abTestId: id, ...body } = args as { abTestId: string; confirm: string }
        return client.post(`/data/ab-tests/${encodeURIComponent(id)}/complete`, { body })
      },
    },
    {
      name: 'get_ab_test_metrics',
      title: 'Get A/B test metrics + significance',
      description:
        'Per-arm performance (sessions, saves, save rate, revenue per exposure, offer breakdown) with statistical significance (confidence, p-value) for the primary metric. Significance needs >= 30 sessions per arm — below that confidence reads 0. ALWAYS read this before pick_ab_test_winner and quote the confidence + sample sizes to the user. Warehouse-backed (~3h lag).',
      inputSchema: z.object({ abTestId }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) =>
        client.get(`/data/ab-tests/${encodeURIComponent((args as { abTestId: string }).abTestId)}/metrics`),
    },
    {
      name: 'pick_ab_test_winner',
      title: 'Pick the A/B test winner',
      description: [
        '**Destructive**: commits the winning variant to 100% of matched live traffic and disables the losing arm. Check get_ab_test_metrics first; do not decide on noise.',
        '',
        'Statistical safeguard: before the enrollment window has elapsed the API refuses unless acknowledgeEarlyDecision: true — only pass it after showing the user the confidence and sample sizes and getting explicit agreement. Pass a rationale; it is recorded with the decision and in the audit log (audit action: pick_winner).',
      ].join('\n'),
      inputSchema: z.object({
        confirm: confirmLiteral('pick_winner'),
        abTestId,
        winnerSegmentId: z.string().describe("One of the test's arm segment ids."),
        rationale: z.string().optional().describe('Why this arm won — stored on the test and in the audit log.'),
        acknowledgeEarlyDecision: z
          .boolean()
          .optional()
          .describe(
            'Required when deciding before the enrollment window has elapsed. Only after explicit user agreement.',
          ),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const { abTestId: id, ...body } = args as { abTestId: string } & Record<string, unknown>
        return client.post(`/data/ab-tests/${encodeURIComponent(id)}/winner`, { body })
      },
    },
  ]
}
