import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const reorderInput = z.object({
  segmentIds: z
    .array(z.string())
    .min(1)
    .describe(
      'Segment IDs in desired priority order. Any existing segments omitted from this list are kept after the provided IDs in their current relative order.',
    ),
  confirm: z
    .literal('reorder_segments')
    .describe(
      'Required confirmation. Segment priority can change which flow customers see; pass exactly "reorder_segments".',
    ),
})

export function segmentTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'list_segments',
      title: 'List cancel flow segments',
      description: [
        'List cancel flow segment metadata for the authenticated org in priority order (the response order IS the priority — first = highest priority; the 0-based `priority` field mirrors it). Includes disabled segments (each has an `enabled` boolean). Each segment also returns its audience `filter` rules ([{ attribute, operand, value }]) so you can reason about which customers a flow targets.',
        '',
        'A/B test variant segments appear as separate top-level entries here (the dashboard folds them under their parent test), so treat segments cautiously when reordering. Use this before reorder_segments.',
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/segments'),
    },
    {
      name: 'reorder_segments',
      title: 'Reorder cancel flow segments',
      description:
        'Reorder cancel flow segment priority. This is a live-impacting configuration change, so it requires explicit confirmation and records an audit log.',
      inputSchema: reorderInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      handler: async (args) => client.post('/data/segments/reorder', { body: args }),
    },
  ]
}
