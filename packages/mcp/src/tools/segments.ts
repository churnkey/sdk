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
      description:
        'List active cancel flow segments for the authenticated org in current priority order. Use before reorder_segments.',
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
