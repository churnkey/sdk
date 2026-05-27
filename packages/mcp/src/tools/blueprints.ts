import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const blueprintIdInput = z.object({
  blueprintId: z.string().describe('Churnkey blueprint ID. Use list_blueprints first if you do not know it.'),
})

const draftUpdates = z
  .object({
    name: z.string().optional().describe('Blueprint display name.'),
    brandImage: z.string().url().optional().describe('Brand image URL. SVG URLs are rejected by the API.'),
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
    choiceGuid: z.string().optional().describe('Preferred stable survey choice identifier.'),
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
  stepGuid: z.string().optional().describe('Preferred stable step identifier.'),
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
      description:
        'List the current cancel flow inventory for the authenticated org: the default org flow plus segment flows, each with status, a published boolean, compact draft metadata, and compact publishedBlueprint metadata. Status mirrors the dashboard badges: Active, Setup Pending, or Inactive. Use editableBlueprintId for draft updates, or fetch a full blueprint before changing steps.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/blueprints'),
    },
    {
      name: 'get_blueprint',
      title: 'Get a cancel flow blueprint',
      description:
        'Fetch one cancel flow blueprint by ID. Use this before updating; draft updates should preserve unchanged steps and only edit the intended fields.',
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
