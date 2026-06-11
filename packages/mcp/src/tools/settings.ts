import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const stripeSettingsUpdates = z
  .object({
    planChangeProrate: z.boolean().optional().describe('Apply proration on plan changes.'),
    planChangeImmediate: z.boolean().optional().describe('Apply plan changes immediately vs end of cycle.'),
    cancelImmediate: z
      .boolean()
      .optional()
      .describe('Cancel immediately (true) instead of at end of term (false, default). Forfeits remaining paid time.'),
    unpauseOnCancel: z
      .boolean()
      .optional()
      .describe('Also unpause when canceling a paused subscription (Stripe only).'),
    pauseEndOfTerm: z
      .boolean()
      .optional()
      .describe(
        'Pause Wall: start pauses at end of cycle (true) vs immediately (false). Mutually exclusive with annualPauseExtendTerm.',
      ),
    annualPauseExtendTerm: z
      .boolean()
      .optional()
      .describe('Allow annual subscribers to pause, extending their term. Mutually exclusive with pauseEndOfTerm.'),
    pauseInvoiceBehavior: z
      .enum(['mark_uncollectible', 'void'])
      .optional()
      .describe('Stripe pause_collection invoice behavior.'),
    stackCoupons: z
      .boolean()
      .optional()
      .describe('Stack new coupons on existing ones instead of replacing. Can compound discounts.'),
    recordSession: z.boolean().optional().describe('Record cancel flow sessions (required for analytics).'),
    pastCollectionPeriod: z
      .union([z.literal(30), z.literal(60), z.literal(90)])
      .optional()
      .describe('Days past due after which customers can no longer self-serve payment.'),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Pass at least one setting to update.' })

const range = (min: number, max: number, what: string) =>
  z
    .object({
      min: z.number().int().min(min).max(max).describe(`Lower bound (${what}).`),
      max: z.number().int().min(min).max(max).describe(`Upper bound (${what}).`),
    })
    .strict()

export function settingsTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'get_stripe_settings',
      title: 'Read billing provider settings',
      description: [
        'Read the workspace billing/provider settings (proration, cancellation timing, pause behavior, invoice handling on pause, coupon stacking, session recording, past-due collection window).',
        '',
        'Each setting comes with its current value, default, an explanation of what it does, and a recommendation — read and relay these to the user BEFORE proposing changes. Great for a read-only audit ("show me my settings and flag anything unusual").',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/stripe-settings'),
    },
    {
      name: 'update_stripe_settings',
      title: 'Update billing provider settings',
      description: [
        'Change workspace billing settings. **These directly affect live billing behavior and revenue** — always read get_stripe_settings first, explain the implication of each change to the user, and get their agreement.',
        '',
        'Validation explains conflicts instead of failing silently (e.g. pauseEndOfTerm and annualPauseExtendTerm are mutually exclusive). The response includes before/after values and any auto-resolved interactions. Requires confirm: "update_stripe_settings" and the stripe_settings.write scope. Audit-logged with prior and new values.',
      ].join('\n'),
      inputSchema: z.object({
        confirm: z
          .literal('update_stripe_settings')
          .describe(
            'Required confirmation. These settings change live billing behavior; pass exactly "update_stripe_settings".',
          ),
        updates: stripeSettingsUpdates,
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => client.post('/data/stripe-settings', { body: args }),
    },
    {
      name: 'get_adaptive_offers',
      title: 'Read adaptive offer configuration',
      description: [
        'Read the adaptive (auto-optimized) discount configuration: enabled state, optimization strategy (conservative/balanced/aggressive), discount percentage range, duration range, billing-interval overrides, total combinations, and whether the workspace has Intelligence access.',
        '',
        'Per-session explainability: sessions record autoOptimizationKey (which optimizer bucket served the offer) — read it via list_sessions.',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/adaptive-offers'),
    },
    {
      name: 'update_adaptive_offers',
      title: 'Configure adaptive offers',
      description: [
        'Configure adaptive discount optimization: enable/disable, strategy, and threshold ranges. Enabling requires a Churnkey Intelligence plan.',
        '',
        '**Changing strategy or thresholds resets the optimizer’s learning period** — short-term performance may dip while it re-explores. Do not toggle casually; confirm intent with the user. Guardrails: discounts are capped at 5–95% in 5% steps (no accidental 100%-off). Requires confirm: "update_adaptive_offers".',
        '',
        'To attach an adaptive offer to a flow step, use update_blueprint_offer with config.autoOptimize: true — that call requires BOTH cancel_flows.adaptive_offers.write and cancel_flows.blueprints.write scopes.',
      ].join('\n'),
      inputSchema: z.object({
        confirm: z
          .literal('update_adaptive_offers')
          .describe(
            'Required confirmation. Changes live discounting and resets the learning period; pass exactly "update_adaptive_offers".',
          ),
        enabled: z
          .boolean()
          .optional()
          .describe('Turn adaptive offers on/off (enabling requires Intelligence access).'),
        strategy: z
          .enum(['conservative', 'balanced', 'aggressive'])
          .optional()
          .describe(
            'Optimization strategy: conservative (<60% margins), balanced (60–80%, default), aggressive (>80%).',
          ),
        percentAmountRange: range(5, 95, 'discount %, multiples of 5')
          .optional()
          .describe('Discount percentage bounds (5–95, step 5).'),
        monthsDurationRange: range(1, 12, 'months').optional().describe('Discount duration bounds in months (1–12).'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => client.post('/data/adaptive-offers', { body: args }),
    },
  ]
}
