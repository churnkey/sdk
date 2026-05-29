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
        'Allowed updates: step header, description, enabled, offer header/description, and survey choice value/followupQuestion by choiceGuid or choiceIndex.',
        '',
        'Copy changes clear stale translations for the affected step/offer/survey choice. Auto translation is refreshed on publish, not during this draft patch.',
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
