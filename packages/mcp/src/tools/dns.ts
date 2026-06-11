import { z } from 'zod'
import type { ChurnkeyClient } from '../client'
import type { ToolDefinition } from './types'

const BOUNDARY =
  "IMPORTANT: the actual DNS records live at the CUSTOMER's DNS provider — Churnkey only registers the domain on its edge. After adding a domain, relay the requiredRecords to the user (or their DNS assistant) verbatim, then poll check_domain_status to confirm propagation."

export function dnsTools(client: ChurnkeyClient): ToolDefinition[] {
  return [
    {
      name: 'get_dns_config',
      title: 'Read hosted-page domain setup',
      description: [
        'Current domain setup for Churnkey-hosted pages: the churnkey.co subdomain, every registered custom domain with its propagation status (live / dns_ok_ssl_pending / awaiting_dns), a per-domain nextStep, and the exact DNS records the customer must add.',
        '',
        BOUNDARY,
      ].join('\n'),
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async () => client.get('/data/dns'),
    },
    {
      name: 'set_hosted_subdomain',
      title: 'Set the Churnkey-hosted subdomain',
      description: [
        'Set the workspace subdomain on churnkey.co (e.g. "acme" → acme.churnkey.co) for hosted pages. Idempotent — re-setting an existing subdomain returns its current state. No customer-side DNS is needed; the page is live immediately.',
        '',
        'Requires confirm: "set_subdomain".',
      ].join('\n'),
      inputSchema: z.object({
        confirm: z.literal('set_subdomain').describe('Required confirmation literal.'),
        subdomain: z
          .string()
          .min(1)
          .max(63)
          .describe('Lowercase letters, digits, and hyphens only — the part before .churnkey.co.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      handler: async (args) => client.post('/data/dns/subdomain', { body: args }),
    },
    {
      name: 'add_custom_domain',
      title: 'Register a custom domain',
      description: [
        'Register a custom domain (e.g. billing.example.com) for Churnkey-hosted pages. Idempotent — re-adding an existing domain returns its current state instead of failing.',
        '',
        'The response includes `requiredRecords` (the CNAME the customer must add) and a `nextStep`. ' + BOUNDARY,
        '',
        'Requires confirm: "add_custom_domain".',
      ].join('\n'),
      inputSchema: z.object({
        confirm: z.literal('add_custom_domain').describe('Required confirmation literal.'),
        domain: z.string().describe('Full hostname like "billing.example.com" — lowercase, no protocol, no path.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      handler: async (args) => client.post('/data/dns/domains', { body: args }),
    },
    {
      name: 'check_domain_status',
      title: 'Check custom domain propagation',
      description: [
        'Re-check DNS propagation + SSL state for a registered custom domain (by id from get_dns_config / add_custom_domain) and persist the result. Returns status (live / dns_ok_ssl_pending / awaiting_dns) and a human-readable nextStep — quote it to the user. Propagation can take minutes to hours depending on the record TTL, so poll patiently.',
      ].join('\n'),
      inputSchema: z.object({
        domainId: z.string().describe('Domain registration id (from get_dns_config or add_custom_domain).'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
      handler: async (args) =>
        client.get(`/data/dns/domains/${encodeURIComponent(String((args as { domainId: string }).domainId))}/status`),
    },
    {
      name: 'remove_custom_domain',
      title: 'Remove a custom domain',
      description:
        'Deregister a custom domain — the hosted page stops being served on it immediately. Requires confirm: "remove_custom_domain". Destructive; confirm with the user first.',
      inputSchema: z.object({
        confirm: z.literal('remove_custom_domain').describe('Required confirmation literal.'),
        domainId: z.string().describe('Domain registration id (from get_dns_config).'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
      handler: async (args) => {
        const { domainId, ...body } = args as { domainId: string; confirm: string }
        return client.post(`/data/dns/domains/${encodeURIComponent(domainId)}/remove`, { body })
      },
    },
  ]
}
