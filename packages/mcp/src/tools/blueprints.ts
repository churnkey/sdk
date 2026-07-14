import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const blueprintIdInput = z.object({
  blueprintId: z.string().describe('Churnkey blueprint ID. Use list_blueprints first if you do not know it.'),
})

// Mirrors the server's validateImageUrl (churnkey-api src/helpers/aws.js): images hosted on
// images.churnkey.co are always trusted; otherwise the URL path must end in an allowed raster
// extension. SVG (and anything else) is rejected. The server does not require https, so we don't either.
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const brandImage = z
  .string()
  .refine(
    (value) => {
      if (value.startsWith('https://images.churnkey.co/')) return true
      let pathname: string
      try {
        pathname = new URL(value).pathname
      } catch {
        return false
      }
      const ext = pathname.split('.').pop()?.toLowerCase()
      return Boolean(ext && IMAGE_EXTENSIONS.includes(ext))
    },
    {
      message:
        'brandImage must be a URL whose path ends in .png/.jpg/.jpeg/.gif/.webp (SVG and other formats are rejected); churnkey.co-hosted images are always accepted.',
    },
  )
  .describe(
    'Brand image URL. Must point to a PNG/JPG/JPEG/GIF/WebP image (SVG and other formats are rejected by the API); images on images.churnkey.co are always accepted.',
  )

const draftUpdates = z
  .object({
    name: z.string().optional().describe('Blueprint display name.'),
    brandImage: brandImage.optional(),
    primaryColor: z.string().optional().describe('Primary hex color for the flow, e.g. "#F7B200".'),
    translatedLanguages: z
      .array(z.string())
      .optional()
      .describe('Locale keys already translated for this blueprint. Usually preserve the existing value.'),
  })
  .strict()
  .describe(
    'Allowed draft-only blueprint fields. If a published blueprint ID is supplied, the API edits its working copy.',
  )

const updateDraftInput = blueprintIdInput.extend({
  updates: draftUpdates,
})

const surveyChoicePatch = z
  .object({
    choiceGuid: z.string().min(1).optional().describe('Preferred stable survey choice identifier.'),
    choiceIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Zero-based choice index for legacy choices without guids.'),
    value: z.string().optional().describe('Survey choice display text.'),
    followupQuestion: z.string().optional().describe('Follow-up question text for this choice.'),
  })
  .strict()
  .refine((value) => (value.choiceGuid ? 1 : 0) + (value.choiceIndex !== undefined ? 1 : 0) === 1, {
    message: 'Pass exactly one of choiceGuid or choiceIndex.',
  })
  .refine((value) => value.value !== undefined || value.followupQuestion !== undefined, {
    message: 'Pass at least one survey choice update field.',
  })

const stepUpdates = z
  .object({
    header: z.string().optional().describe('Step headline text. Clears stale translations for the step.'),
    description: z.string().optional().describe('Step description text. Clears stale translations for the step.'),
    enabled: z.boolean().optional().describe('Whether this step is enabled. Does not affect translations.'),
    offer: z
      .object({
        header: z.string().optional().describe('Offer headline text. Clears stale offer translations.'),
        description: z.string().optional().describe('Offer description text. Clears stale offer translations.'),
      })
      .strict()
      .optional()
      .describe('Offer copy updates for offer steps.'),
    survey: z
      .object({
        randomize: z.boolean().optional().describe('Randomize survey response order.'),
        followupRequired: z.boolean().optional().describe('Whether a follow-up response is required.'),
        minLength: z.number().int().min(0).optional().describe('Minimum follow-up character length.'),
      })
      .strict()
      .optional()
      .describe('Survey behavior flags for survey steps (behavioral; does not affect translations).'),
    freeformConfig: z
      .object({
        inputRequired: z.boolean().optional().describe('Require freeform feedback before continuing.'),
        minLength: z.number().int().min(0).optional().describe('Minimum freeform character length.'),
      })
      .strict()
      .optional()
      .describe('Config for freeform steps (behavioral; does not affect translations).'),
    confirmConfig: z
      .object({
        discountNotice: z.boolean().optional().describe('Warn customers with an active discount they will lose it.'),
        requireAcknowledgement: z
          .boolean()
          .optional()
          .describe('Require explicit acknowledgement on the confirm step.'),
      })
      .strict()
      .optional()
      .describe('Config for confirm steps (behavioral; does not affect translations).'),
    surveyChoices: z
      .array(surveyChoicePatch)
      .optional()
      .describe(
        'Survey choice copy updates by choiceGuid or choiceIndex. Clears stale translations for changed choices.',
      ),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Pass at least one step update field.' })

const updateStepInput = blueprintIdInput.extend({
  stepGuid: z.string().min(1).optional().describe('Preferred stable step identifier.'),
  stepIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Zero-based step index for legacy blueprints without step guids.'),
  updates: stepUpdates,
})

const publishInput = blueprintIdInput.extend({
  confirm: z
    .literal('publish')
    .describe('Required confirmation. Publishing affects the live cancel flow; pass exactly "publish".'),
})

const WRITE_NOTE =
  'This is a configuration write. The API records an audit log with the changed fields and Data API source.'

function requireOneStepSelector(args: { stepGuid?: unknown; stepIndex?: unknown }) {
  if ((args.stepGuid ? 1 : 0) + (args.stepIndex !== undefined ? 1 : 0) !== 1) {
    throw new Error('Pass exactly one of stepGuid or stepIndex.')
  }
}

// update_blueprint_offer (G3). Config fields span all offer types; the server validates them against
// the offer's own offerType. Kept as one strict object (not a discriminated union) so offerType can be
// omitted for config-only edits and the tool schema stays a plain object.
const rebateFixedAmounts = z
  .array(
    z
      .object({
        currency: z
          .string()
          .regex(/^[A-Za-z]{3}$/)
          .describe('Three-letter invoice currency code.'),
        amountMinor: z.number().int().min(0).describe("Fixed rebate in that currency's smallest unit."),
      })
      .strict(),
  )
  .refine((amounts) => new Set(amounts.map((amount) => amount.currency.toLowerCase())).size === amounts.length, {
    message: 'Fixed rebate currencies must be unique.',
  })

const offerConfig = z
  .object({
    couponId: z
      .string()
      .optional()
      .describe('DISCOUNT: Stripe/provider coupon ID. Omit to derive a custom coupon from customAmount.'),
    customAmount: z.number().int().min(0).optional().describe('DISCOUNT: custom discount amount in CENTS.'),
    customDuration: z.enum(['ONCE', 'FOREVER']).optional().describe('DISCOUNT: how long the custom discount applies.'),
    autoOptimize: z.boolean().optional().describe('DISCOUNT: let Churnkey pick the discount.'),
    maxPauseLength: z.number().int().min(1).optional().describe('PAUSE: maximum pause length.'),
    pauseInterval: z.enum(['MONTH', 'WEEK']).optional().describe('PAUSE: unit for maxPauseLength.'),
    datePicker: z
      .boolean()
      .optional()
      .describe('PAUSE: let the customer pick a resume date (supported providers only).'),
    trialExtensionDays: z.number().int().min(1).optional().describe('TRIAL_EXTENSION: days to extend the trial.'),
    redirectUrl: z.string().optional().describe('REDIRECT: URL to send the customer to.'),
    redirectLabel: z.string().optional().describe('REDIRECT: button label.'),
    options: z.array(z.string()).optional().describe('PLAN_CHANGE: plan/price IDs the customer can switch to.'),
    amountType: z.enum(['FIXED', 'PERCENT']).optional().describe('REBATE: fixed or percentage amount.'),
    fixedAmounts: rebateFixedAmounts.optional().describe('REBATE: fixed rebate amounts by invoice currency.'),
    percentAmount: z.number().int().min(0).max(100).optional().describe('REBATE: percentage of the paid invoice.'),
    mbgWindowDays: z.number().int().min(0).optional().describe('REBATE: money-back guarantee window in days.'),
    invoiceScope: z.enum(['FIRST_PAID', 'LATEST_PAID']).optional().describe('REBATE: which paid invoice is eligible.'),
  })
  .strict()
  .describe("Offer-type-specific config. The server validates which fields are allowed against the offer's offerType.")

const updateOfferInput = blueprintIdInput.extend({
  stepGuid: z.string().min(1).describe('Guid of the step that owns or contains the offer.'),
  choiceGuid: z
    .string()
    .min(1)
    .optional()
    .describe('Edit the offer attached to this survey choice (instead of the step offer).'),
  optionGuid: z
    .string()
    .min(1)
    .optional()
    .describe('Edit the offer attached to this structured follow-up option. Requires choiceGuid.'),
  offerType: z
    .enum(['PAUSE', 'DISCOUNT', 'CONTACT', 'PLAN_CHANGE', 'REDIRECT', 'TRIAL_EXTENSION', 'REBATE'])
    .optional()
    .describe('Change the offer type. Switching type seeds default config for the new type.'),
  header: z.string().optional().describe('Offer headline. Clears stale offer translations.'),
  description: z.string().optional().describe('Offer description. Clears stale offer translations.'),
  config: offerConfig.optional(),
})

// edit_survey_structure (G5). One object with an `op` discriminator; per-op fields are validated
// server-side. Kept as a plain object (not a zod discriminatedUnion) so the tool schema exposes `.shape`.
const editSurveyInput = blueprintIdInput.extend({
  op: z
    .enum(['add_choice', 'remove_choice', 'reorder_choices', 'set_followup'])
    .describe('Structural operation to perform on the survey step.'),
  stepGuid: z.string().min(1).describe('Guid of the survey step (from get_blueprint).'),
  value: z.string().optional().describe('add_choice: choice display text (default "New Response").'),
  type: z.enum(['RADIO', 'INPUT']).optional().describe('add_choice: choice type (default RADIO).'),
  index: z.number().int().min(0).optional().describe('add_choice: insert position (default append).'),
  followup: z
    .object({ question: z.string().optional() })
    .strict()
    .optional()
    .describe('add_choice: attach a follow-up question (also sets the choice type to INPUT).'),
  choiceGuid: z.string().min(1).optional().describe('remove_choice / set_followup: target choice guid.'),
  choiceIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('remove_choice / set_followup: target choice index (legacy).'),
  choiceGuids: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe('reorder_choices: the complete set of existing choice guids in the new order (must be a permutation).'),
  mode: z
    .enum(['freeform', 'structured', 'freeform-structured', 'none'])
    .optional()
    .describe('set_followup: follow-up mode. "none" removes the follow-up.'),
  question: z.string().optional().describe('set_followup: follow-up question text.'),
  structured: z
    .object({
      freeformLabel: z.string().optional().describe('Label for the free-text option in freeform-structured mode.'),
      options: z
        .array(z.object({ value: z.string().min(1), guid: z.string().min(1).optional() }).strict())
        .optional()
        .describe('Structured follow-up options; the server assigns a guid to any option without one.'),
    })
    .strict()
    .optional()
    .describe('set_followup: structured follow-up options config.'),
})

const addStepInput = blueprintIdInput.extend({
  place: z
    .enum(['INITIAL_OFFER', 'SURVEY', 'FREEFORM', 'FINAL_OFFER', 'CONFIRM'])
    .describe(
      'Canonical step slot. Each slot can hold one step. FINAL_OFFER requires an existing INITIAL_OFFER (a single offer is the initial offer). Offer steps are created with a base DISCOUNT offer — configure it with update_blueprint_offer.',
    ),
})

const removeStepInput = blueprintIdInput.extend({
  stepGuid: z.string().min(1).describe('Guid of the step to remove (from get_blueprint).'),
})

export function blueprintTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'list_blueprints',
      title: 'List cancel flow blueprints',
      description: [
        'List the current cancel flow inventory for the authenticated org: the default org flow plus every non-deleted segment flow (including segments that are not yet set up or disabled). Each flow has a `status` (`active`, `setup_pending`, or `inactive`), a `published` boolean, a `hasUnpublishedChanges` boolean (true when the draft has edits not yet published), compact `draft` metadata, and compact `publishedBlueprint` metadata.',
        '',
        'Status is a coarse subset of the dashboard badges: `active` = a published flow, `setup_pending` = configured but never published (the dashboard\'s "Setup Pending" / "Needs to be Published"), `inactive` = a disabled segment. The dashboard\'s "Unpublished Changes" badge corresponds to `status: "active"` with `hasUnpublishedChanges: true`.',
        '',
        'Use `editableBlueprintId` for draft updates and `publishedBlueprintId` to reference the live version. Blueprint configuration is shared across live and test mode, so this is not affected by the API key prefix.',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/blueprints'),
    },
    {
      name: 'get_blueprint',
      title: 'Get a cancel flow blueprint',
      description: [
        'Fetch one full cancel flow blueprint by ID. Returns the blueprint metadata (name, guid, version, brandImage, primaryColor, translatedLanguages, locked, publishedAt) and the full `steps` array.',
        '',
        'Each step includes its `guid`, `enabled`, copy, an optional `offer` (with `offerType`), and an optional `survey` whose `choices` each carry a `guid` and `value`. Use these `guid`s with update_blueprint_step to patch a specific step or survey choice without resending the whole steps array. Note the response can be large for translated blueprints (every step/offer/choice carries its translations).',
      ].join('\n'),
      inputSchema: blueprintIdInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) => client.get(`/data/blueprints/${args.blueprintId}`),
    },
    {
      name: 'update_blueprint_draft',
      title: 'Update a draft cancel flow blueprint',
      description: [
        'Update top-level fields on an unlocked draft blueprint. If you pass a published blueprint ID, the API resolves it to the corresponding unlocked working copy. This does not publish changes.',
        '',
        'Allowed fields: name, brandImage, primaryColor, translatedLanguages. For step copy/content edits, use update_blueprint_step so the agent does not need to send the full steps array.',
        '',
        WRITE_NOTE,
      ].join('\n'),
      inputSchema: updateDraftInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/blueprints/${args.blueprintId}/draft`, { body: { updates: args.updates } }),
    },
    {
      name: 'update_blueprint_step',
      title: 'Update one draft cancel flow step',
      description: [
        'Patch a single draft blueprint step without sending the full steps array. Prefer stepGuid; use stepIndex only for legacy blueprints without step guids. If you pass a published blueprint ID, the API resolves it to the corresponding unlocked working copy.',
        '',
        'Allowed updates: step header, description, enabled; offer header/description; survey behavior (randomize, followupRequired, minLength); freeform config (inputRequired, minLength); confirm config (discountNotice, requireAcknowledgement); and survey choice value/followupQuestion by choiceGuid or choiceIndex.',
        '',
        'Copy changes clear stale translations for the affected step/offer/survey choice; behavioral flags (enabled, randomize, followupRequired, minLength, inputRequired, discountNotice, requireAcknowledgement) do not. Auto translation is refreshed on publish, not during this draft patch. For offer pricing/coupon config use update_blueprint_offer; for adding/removing/reordering survey choices use edit_survey_structure.',
        '',
        WRITE_NOTE,
      ].join('\n'),
      inputSchema: updateStepInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      handler: async (args) => {
        requireOneStepSelector(args)
        const { blueprintId, stepGuid, stepIndex, updates } = args
        return client.post(`/data/blueprints/${blueprintId}/step`, { body: { stepGuid, stepIndex, updates } })
      },
    },
    {
      name: 'update_blueprint_offer',
      title: 'Update a draft cancel flow offer',
      description: [
        'Patch the type and functional config of a single offer on a draft blueprint, without sending the full steps array. Offers attach in three places: an offer step (pass stepGuid only), a survey choice (pass stepGuid + choiceGuid), or a structured follow-up option (pass stepGuid + choiceGuid + optionGuid). The offer must already exist at that location. If you pass a published blueprint ID, the API resolves it to the working copy.',
        '',
        "Change offerType and/or its config: DISCOUNT (couponId, or customAmount in cents + customDuration, or autoOptimize), PAUSE (maxPauseLength + pauseInterval, datePicker), TRIAL_EXTENSION (trialExtensionDays), REDIRECT (redirectUrl, redirectLabel), PLAN_CHANGE (options), REBATE (fixedAmounts or percentAmount, mbgWindowDays, invoiceScope), CONTACT (no config). You may also set header/description. Config is validated against the offer's offerType; switching type seeds default config.",
        '',
        'Config changes do not affect translations; header/description changes clear stale offer translations (refreshed on publish).',
        '',
        WRITE_NOTE,
      ].join('\n'),
      inputSchema: updateOfferInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      handler: async (args) => {
        if (args.optionGuid && !args.choiceGuid) {
          throw new Error('optionGuid requires choiceGuid.')
        }
        const { blueprintId, ...body } = args
        return client.post(`/data/blueprints/${blueprintId}/offer`, { body })
      },
    },
    {
      name: 'edit_survey_structure',
      title: 'Edit a draft cancel flow survey structure',
      description: [
        "Add, remove, or reorder survey response choices, or configure a choice's follow-up, on a draft survey step. This changes the survey STRUCTURE (which options customers can pick) — for editing existing choice copy use update_blueprint_step. If you pass a published blueprint ID, the API resolves it to the working copy.",
        '',
        'Set `op`: add_choice (the server assigns the new choice guid), remove_choice (by choiceGuid/choiceIndex), reorder_choices (pass choiceGuids = the full set in the new order), or set_followup (mode freeform | structured | freeform-structured | none; the server assigns guids to structured options).',
        '',
        'Structural edits clear stale translations for the affected step/choices; auto translation refreshes on publish.',
        '',
        WRITE_NOTE,
      ].join('\n'),
      inputSchema: editSurveyInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      handler: async (args) => {
        const { blueprintId, ...body } = args
        return client.post(`/data/blueprints/${blueprintId}/survey`, { body })
      },
    },
    {
      name: 'add_blueprint_step',
      title: 'Add a step to a draft cancel flow',
      description: [
        'Add a step to a draft blueprint at a canonical slot (place). The server builds a sensible base step for that place, so you do not send a full step object — configure it afterward with update_blueprint_step / update_blueprint_offer / edit_survey_structure. If you pass a published blueprint ID, the API resolves it to the working copy.',
        '',
        'Places: INITIAL_OFFER, SURVEY, FREEFORM, FINAL_OFFER, CONFIRM — each can hold one step, inserted in canonical order. FINAL_OFFER requires an existing INITIAL_OFFER. Offer steps are seeded with a base DISCOUNT offer.',
        '',
        WRITE_NOTE,
      ].join('\n'),
      inputSchema: addStepInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/blueprints/${args.blueprintId}/step/add`, { body: { place: args.place } }),
    },
    {
      name: 'remove_blueprint_step',
      title: 'Remove a step from a draft cancel flow',
      description: [
        'Remove a step from a draft blueprint by stepGuid (from get_blueprint). If you pass a published blueprint ID, the API resolves it to the working copy. The step and its content are removed from the draft (not published until publish_blueprint).',
        '',
        WRITE_NOTE,
      ].join('\n'),
      inputSchema: removeStepInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/blueprints/${args.blueprintId}/step/remove`, { body: { stepGuid: args.stepGuid } }),
    },
    {
      name: 'publish_blueprint',
      title: 'Publish a draft cancel flow blueprint',
      description: [
        'Publish an unlocked draft blueprint as the live version for its org or segment. If you pass a published blueprint ID, the API resolves it to the corresponding unlocked working copy. This is separate from draft updates and requires explicit confirmation.',
        '',
        WRITE_NOTE,
      ].join('\n'),
      inputSchema: publishInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/blueprints/${args.blueprintId}/publish`, { body: { confirm: args.confirm } }),
    },
  ]
}
