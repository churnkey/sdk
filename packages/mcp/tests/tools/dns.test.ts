import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { dnsTools } from '../../src/tools/dns'

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as ChurnkeyClient
}

describe('dns tools', () => {
  it('declares reads as read-only and writes as destructive with confirm literals', () => {
    const byName = Object.fromEntries(dnsTools(makeClient()).map((t) => [t.name, t]))
    expect(byName.get_dns_config.annotations.readOnlyHint).toBe(true)
    expect(byName.check_domain_status.annotations.readOnlyHint).toBe(true)
    expect(byName.add_custom_domain.annotations.destructiveHint).toBe(true)
    expect(byName.remove_custom_domain.annotations.destructiveHint).toBe(true)

    expect(() => byName.add_custom_domain.inputSchema.parse({ domain: 'billing.example.com' })).toThrow()
    expect(() => byName.set_hosted_subdomain.inputSchema.parse({ subdomain: 'acme' })).toThrow()
  })

  it('routes domain-scoped calls with the id in the path and confirm in the body', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(dnsTools(client).map((t) => [t.name, t]))

    await byName.check_domain_status.handler(byName.check_domain_status.inputSchema.parse({ domainId: '42' }))
    expect(client.get).toHaveBeenCalledWith('/data/dns/domains/42/status')

    await byName.remove_custom_domain.handler(
      byName.remove_custom_domain.inputSchema.parse({ confirm: 'remove_custom_domain', domainId: '42' }),
    )
    expect(client.post).toHaveBeenCalledWith('/data/dns/domains/42/remove', {
      body: { confirm: 'remove_custom_domain' },
    })
  })
})
