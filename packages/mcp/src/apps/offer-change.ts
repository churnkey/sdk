import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import { DASHBOARD_URI, webBase } from './dashboard'
import { OFFER_CHANGE_TYPES, type OfferChange, type OfferProposal, type OfferSummary } from './dashboard-types'

// Change an offer from the chat, with a person in the loop. The model calls
// propose_offer_change, which only reads: it finds the offer in the flow's draft
// and renders a before/after card in the dashboard app. The card's Confirm button
// calls apply_offer_change, an app-only tool the model cannot see, which writes
// the draft through the same endpoint as update_blueprint_offer. Neither tool
// publishes: the change goes live only when someone publishes the draft in
// Churnkey, which the card links to.

export const PROPOSE_TOOL = 'propose_offer_change'
export const APPLY_TOOL = 'apply_offer_change'

const proposeInput = z.object({
  segmentId: z
    .string()
    .optional()
    .describe('Segment whose cancel flow to change (from list_segments or the dashboard). Omit for the default flow.'),
  reason: z
    .string()
    .optional()
    .describe(
      'Survey answer to attach the offer to, exactly as the dashboard shows it under "Why they cancel" (e.g. "Too expensive"). Omit to change the flow\'s main offer step.',
    ),
  offerType: z.enum(OFFER_CHANGE_TYPES).describe('DISCOUNT, PAUSE or TRIAL_EXTENSION.'),
  couponId: z
    .string()
    .optional()
    .describe(
      'DISCOUNT: an existing coupon id in the billing provider. Reuse one from get_blueprint or ask the user; never invent one.',
    ),
  autoOptimize: z.boolean().optional().describe('DISCOUNT: let Churnkey pick the discount (adaptive offers).'),
  maxPauseLength: z.number().int().min(1).max(24).optional().describe('PAUSE: longest pause the customer can pick.'),
  pauseInterval: z.enum(['MONTH', 'WEEK']).optional().describe('PAUSE: unit for maxPauseLength (default MONTH).'),
  trialExtensionDays: z.number().int().min(1).max(365).optional().describe('TRIAL_EXTENSION: days to add.'),
  header: z.string().max(120).optional().describe('Optional new offer headline.'),
  description: z.string().max(400).optional().describe('Optional new offer description.'),
  rationale: z
    .string()
    .max(400)
    .optional()
    .describe('One or two sentences on why, shown to the user on the confirmation card.'),
})

export type ProposeInput = z.infer<typeof proposeInput>

const applyInput = z.object({
  blueprintId: z.string().min(1),
  stepGuid: z.string().min(1),
  choiceGuid: z.string().min(1).optional(),
  offerType: z.enum(OFFER_CHANGE_TYPES),
  config: z
    .object({
      couponId: z.string().min(1).optional(),
      autoOptimize: z.boolean().optional(),
      maxPauseLength: z.number().int().min(1).optional(),
      pauseInterval: z.enum(['MONTH', 'WEEK']).optional(),
      trialExtensionDays: z.number().int().min(1).optional(),
    })
    .strict(),
  header: z.string().optional(),
  description: z.string().optional(),
})

interface Coupon {
  name?: string
  percentOff?: number | null
  amountOff?: number | null
  currency?: string | null
  duration?: string | null
  durationInMonths?: number | null
}

interface Offer {
  offerType?: string
  header?: string
  discountConfig?: { couponId?: string; autoOptimize?: boolean; coupon?: Coupon }
  pauseConfig?: { maxPauseLength?: number; pauseInterval?: string }
  trialExtensionConfig?: { trialExtensionDays?: number }
}

interface Step {
  guid: string
  stepType?: string
  enabled?: boolean
  offer?: Offer
  survey?: { choices?: Array<{ guid: string; value?: string; offer?: Offer }> }
}

interface Blueprint {
  _id: string
  steps?: Step[]
}

interface Inventory {
  flows?: Array<{
    flowId: string
    scope: string
    editableBlueprintId: string | null
    segment?: { id: string; name: string }
  }>
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

function couponText(couponId: string | undefined, coupon: Coupon | undefined): string {
  if (!coupon) return couponId ? `Coupon ${couponId}` : 'Discount (no coupon set)'
  const amount =
    coupon.percentOff != null
      ? `${coupon.percentOff}% off`
      : coupon.amountOff != null
        ? `${(coupon.amountOff / 100).toLocaleString('en-US', { style: 'currency', currency: (coupon.currency || 'usd').toUpperCase() })} off`
        : 'Discount'
  const duration =
    coupon.duration === 'forever'
      ? 'forever'
      : coupon.duration === 'repeating' && coupon.durationInMonths
        ? `for ${plural(coupon.durationInMonths, 'month')}`
        : 'once'
  // Skip a coupon name that only restates the amount ("50% off next month").
  const name = coupon.name && !coupon.name.includes(amount.split(' ')[0]) ? ` (${coupon.name})` : ''
  return `${amount} ${duration}${name}`
}

/** Plain-language summary of an offer. `coupons` resolves coupon ids seen elsewhere in the blueprint. */
export function describeOffer(offer: Offer, coupons: Map<string, Coupon> = new Map()): OfferSummary {
  const type = offer.offerType ?? 'UNKNOWN'
  let text: string
  switch (type) {
    case 'DISCOUNT': {
      const d = offer.discountConfig ?? {}
      text = d.autoOptimize
        ? 'Adaptive discount (Churnkey picks it)'
        : couponText(d.couponId, d.coupon ?? (d.couponId ? coupons.get(d.couponId) : undefined))
      break
    }
    case 'PAUSE': {
      const p = offer.pauseConfig ?? {}
      text = p.maxPauseLength
        ? `Pause for up to ${plural(p.maxPauseLength, p.pauseInterval === 'WEEK' ? 'week' : 'month')}`
        : 'Pause'
      break
    }
    case 'TRIAL_EXTENSION': {
      const days = offer.trialExtensionConfig?.trialExtensionDays
      text = days ? `Extend the trial by ${plural(days, 'day')}` : 'Trial extension'
      break
    }
    default:
      text = type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ')
  }
  return { offerType: type, text, header: offer.header ?? null }
}

function knownCoupons(steps: Step[]): Map<string, Coupon> {
  const map = new Map<string, Coupon>()
  const add = (offer?: Offer) => {
    const d = offer?.discountConfig
    if (d?.couponId && d.coupon) map.set(d.couponId, d.coupon)
  }
  for (const step of steps) {
    add(step.offer)
    for (const choice of step.survey?.choices ?? []) add(choice.offer)
  }
  return map
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

function configFor(args: ProposeInput): OfferChange['config'] {
  switch (args.offerType) {
    case 'DISCOUNT':
      if (args.autoOptimize) return { autoOptimize: true }
      if (!args.couponId) {
        throw new Error(
          'A DISCOUNT needs couponId (an existing coupon in the billing provider) or autoOptimize: true. Ask the user which coupon to use.',
        )
      }
      return { couponId: args.couponId, autoOptimize: false }
    case 'PAUSE':
      if (!args.maxPauseLength) throw new Error('A PAUSE needs maxPauseLength.')
      return { maxPauseLength: args.maxPauseLength, pauseInterval: args.pauseInterval ?? 'MONTH' }
    case 'TRIAL_EXTENSION':
      if (!args.trialExtensionDays) throw new Error('A TRIAL_EXTENSION needs trialExtensionDays.')
      return { trialExtensionDays: args.trialExtensionDays }
  }
}

export async function proposeOfferChange(client: ChurnkeyClient, args: ProposeInput): Promise<OfferProposal> {
  const config = configFor(args)
  const inventory = await client.get<Inventory>('/data/blueprints')
  const flow = (inventory?.flows ?? []).find((f) =>
    args.segmentId ? f.scope === 'segment' && f.flowId === args.segmentId : f.scope === 'org',
  )
  if (!flow) {
    throw new Error(
      args.segmentId ? `Segment ${args.segmentId} has no cancel flow.` : 'This workspace has no default cancel flow.',
    )
  }
  if (!flow.editableBlueprintId) {
    throw new Error('This flow has no draft to edit yet. Set it up in Churnkey first.')
  }
  const blueprint = await client.get<Blueprint>(`/data/blueprints/${encodeURIComponent(flow.editableBlueprintId)}`)
  const steps = blueprint.steps ?? []

  let stepGuid: string
  let choiceGuid: string | undefined
  let target: string
  let current: Offer | undefined
  if (args.reason) {
    const survey = steps.find((s) => s.stepType === 'SURVEY' && s.survey?.choices?.length)
    const choice = survey?.survey?.choices?.find((c) => normalize(c.value ?? '') === normalize(args.reason ?? ''))
    if (!survey || !choice) {
      const answers = (survey?.survey?.choices ?? []).map((c) => `"${c.value}"`).join(', ')
      throw new Error(
        survey
          ? `No survey answer "${args.reason}" in this flow. Answers: ${answers}.`
          : 'This flow has no survey, so offers cannot be tied to an answer. Omit reason to change the main offer.',
      )
    }
    stepGuid = survey.guid
    choiceGuid = choice.guid
    target = `Survey answer "${choice.value}"`
    current = choice.offer
  } else {
    const step = steps.find((s) => s.stepType === 'OFFER' && s.offer)
    if (!step) throw new Error('This flow has no offer step. Pass reason to attach an offer to a survey answer.')
    stepGuid = step.guid
    target = 'Main offer'
    current = step.offer
  }

  const change: OfferChange = {
    blueprintId: flow.editableBlueprintId,
    stepGuid,
    ...(choiceGuid ? { choiceGuid } : {}),
    offerType: args.offerType,
    config,
    ...(args.header ? { header: args.header } : {}),
    ...(args.description ? { description: args.description } : {}),
  }
  const coupons = knownCoupons(steps)
  const after = describeOffer(
    {
      offerType: args.offerType,
      header: args.header ?? (current?.offerType === args.offerType ? current?.header : undefined),
      discountConfig:
        args.offerType === 'DISCOUNT' ? { couponId: config.couponId, autoOptimize: config.autoOptimize } : undefined,
      pauseConfig: args.offerType === 'PAUSE' ? config : undefined,
      trialExtensionConfig: args.offerType === 'TRIAL_EXTENSION' ? config : undefined,
    },
    coupons,
  )
  return {
    kind: 'offer-proposal',
    mode: client.mode,
    flow: {
      scope: flow.scope === 'segment' ? 'segment' : 'org',
      segmentId: flow.scope === 'segment' ? flow.flowId : null,
      name: flow.segment?.name ?? 'Default cancel flow',
    },
    target,
    before: current ? describeOffer(current, coupons) : null,
    after,
    rationale: args.rationale ?? null,
    change,
    builderUrl: `${webBase()}/builder/${encodeURIComponent(flow.editableBlueprintId)}`,
  }
}

export async function applyOfferChange(client: ChurnkeyClient, change: OfferChange): Promise<unknown> {
  const { blueprintId, ...body } = applyInput.parse(change)
  // The draft only. Publishing stays a deliberate step in Churnkey.
  return client.post(`/data/blueprints/${encodeURIComponent(blueprintId)}/offer`, { body })
}

function proposalText(p: OfferProposal): string {
  return [
    `Proposed change to the ${p.flow.name} draft, ${p.target}:`,
    `- Now: ${p.before ? p.before.text : 'no offer'}`,
    `- Proposed: ${p.after.text}`,
    'Nothing has changed yet. The user confirms it on the card, which saves it to the draft; it goes live only when they publish the flow in Churnkey.',
  ].join('\n')
}

const errorResult = (err: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
})

export function registerOfferChange(server: McpServer, client: ChurnkeyClient): void {
  server.registerTool(
    PROPOSE_TOOL,
    {
      title: 'Propose an offer change',
      description: [
        'Show the user a before/after card for changing one offer in a cancel flow, with a Confirm button. Use it after suggesting an offer (for example from the dashboard\'s "Why they cancel" panel) when the user wants to try it.',
        '',
        "This tool changes nothing. If the user confirms on the card, the change is saved to the flow's draft; it goes live only when they publish the draft in Churnkey. Attach the offer to a survey answer with `reason`, or omit it to change the main offer step. Supports DISCOUNT (existing couponId, or autoOptimize), PAUSE and TRIAL_EXTENSION.",
      ].join('\n'),
      inputSchema: proposeInput.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        ui: { resourceUri: DASHBOARD_URI },
        'ui/resourceUri': DASHBOARD_URI,
      },
    },
    async (args: unknown) => {
      try {
        const proposal = await proposeOfferChange(client, proposeInput.parse(args ?? {}))
        return {
          structuredContent: proposal as unknown as Record<string, unknown>,
          content: [{ type: 'text' as const, text: proposalText(proposal) }],
        }
      } catch (err) {
        return errorResult(err)
      }
    },
  )

  server.registerTool(
    APPLY_TOOL,
    {
      title: 'Apply an offer change to the draft',
      description:
        'Save a confirmed offer change to a cancel flow draft. Called by the confirmation card only; it never publishes.',
      inputSchema: applyInput.shape,
      // Overwrites the draft offer at that spot, so it is destructive even though it never publishes.
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { visibility: ['app'] } },
    },
    async (args: unknown) => {
      try {
        const result = await applyOfferChange(client, applyInput.parse(args ?? {}))
        return {
          structuredContent: { saved: true, result } as Record<string, unknown>,
          content: [{ type: 'text' as const, text: 'Saved to the draft. Not published.' }],
        }
      } catch (err) {
        return errorResult(err)
      }
    },
  )
}
