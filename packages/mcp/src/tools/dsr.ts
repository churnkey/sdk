import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const accessInput = z.object({
  email: z.string().email().describe('Customer email to fetch all stored Churnkey data for.'),
})

const deleteInput = z.object({
  email: z
    .string()
    .email()
    .describe(
      'Customer email to permanently delete from Churnkey. All sessions, feedback, and PII associated with this email are removed.',
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
      description: [
        'Permanently delete all Churnkey data for a customer email (GDPR Article 17 / CCPA right-to-delete). DESTRUCTIVE and irreversible. Always confirm the exact email with the user before invoking.',
        '',
        'Deletion is all-or-nothing. Check the `deleted` boolean in the response: when true, `deletedCounts` lists what was removed; when false, nothing was deleted and `reasonForRejection` explains why (e.g. the profile is too large to delete via the API — contact support). Relay `reasonForRejection` rather than reporting success. A small number of accounts have DSR disabled and return a 403 with a support-contact message.',
      ].join('\n'),
      inputSchema: deleteInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      handler: async (args) => client.post('/data/dsr/delete', { body: args }),
    },
  ]
}
