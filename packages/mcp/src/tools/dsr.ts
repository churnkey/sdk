import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const accessInput = z.object({
  email: z
    .string()
    .email()
    .describe('Customer email (exact match) to fetch all stored Churnkey data for. Case-insensitive.'),
})

const deleteInput = z.object({
  email: z
    .string()
    .email()
    .describe(
      'Customer email (exact match) to permanently delete from Churnkey. All sessions, feedback, and PII associated with this email are removed.',
    ),
})

export function dsrTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'dsr_access',
      title: 'GDPR/CCPA data access request',
      description:
        'Fetch every record Churnkey holds for a customer email — sessions, surveys, feedback, accepted offers. Read-only. Use to fulfill GDPR Article 15 / CCPA right-to-know requests.',
      inputSchema: accessInput,
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) => client.post('/data/dsr/access', { body: args }),
    },
    {
      name: 'dsr_delete',
      title: 'GDPR/CCPA data delete request',
      description:
        'Permanently delete all Churnkey data for a customer email (GDPR Article 17 / CCPA right-to-delete). DESTRUCTIVE and irreversible. Always confirm the exact email with the user before invoking.',
      inputSchema: deleteInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      handler: async (args) => client.post('/data/dsr/delete', { body: args }),
    },
  ]
}
