import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const accessInput = z.object({
  email: z.string().email().describe('Customer email to fetch all stored Churnkey data for.'),
})

// Access only. Erasure is deliberately not a tool: the confirm literal that
// gates our other destructive writes is typed by the model itself, which stops
// a malformed call but not an unwanted one, and nothing here can be undone by
// declining to publish. It stays on POST /v1/data/dsr/delete.
export function dsrTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'dsr_access',
      title: 'GDPR/CCPA data access request',
      description:
        'Fetch every record Churnkey holds for a customer email — sessions, surveys, feedback, accepted offers. Read-only. Use to fulfill GDPR Article 15 / CCPA right-to-know requests. Deletion (Article 17 / right-to-erasure) is not available here; it runs through the Churnkey dashboard or the Data API.',
      inputSchema: accessInput,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      handler: async (args) => client.post('/data/dsr/access', { body: args }),
    },
  ]
}
