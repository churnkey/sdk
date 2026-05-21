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
    steps: z
      .array(z.record(z.unknown()))
      .optional()
      .describe('Full draft steps array. Fetch the blueprint first and preserve unchanged steps.'),
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

const publishInput = blueprintIdInput.extend({
  confirm: z
    .literal('publish')
    .describe('Required confirmation. Publishing affects the live cancel flow; pass exactly "publish".'),
})

const WRITE_NOTE =
  'This is a configuration write. The API records an audit log with the changed fields and Data API source.'

export function blueprintTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'list_blueprints',
      title: 'List cancel flow blueprints',
      description:
        'List the current cancel flow inventory for the authenticated org: the default org flow plus segment flows, each with compact draft and published metadata. Use editableBlueprintId for draft updates, or fetch a full blueprint before changing steps.',
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
        'Update allowed fields on an unlocked draft blueprint. If you pass a published blueprint ID, the API resolves it to the corresponding unlocked working copy. This does not publish changes.',
        '',
        'Allowed fields: name, brandImage, primaryColor, steps, translatedLanguages.',
        '',
        WRITE_NOTE,
      ].join('\n'),
      inputSchema: updateDraftInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      handler: async (args) =>
        client.post(`/data/blueprints/${args.blueprintId}/draft`, { body: { updates: args.updates } }),
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
