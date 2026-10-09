import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { accountTools } from '../../src/tools/account'
import { dnsTools } from '../../src/tools/dns'
import { paymentRecoveryTools } from '../../src/tools/payment-recovery'

const readiness = {
  ready: false,
  recoveryLink: { ok: false, host: null, source: null },
  senderDomains: { verified: [] },
  dunningEnabled: true,
  hasAccess: true,
  publishedBlueprint: false,
  blockers: [{ code: 'NO_RECOVERY_LINK', message: 'No recovery page domain.', nextStep: 'Set a subdomain.' }],
  warnings: [],
}

function makeClient(response: unknown = {}) {
  return {
    get: vi.fn().mockResolvedValue(response),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as ChurnkeyClient
}

function toolsByName(client: ChurnkeyClient) {
  return Object.fromEntries(
    [...accountTools(client), ...dnsTools(client), ...paymentRecoveryTools(client)].map((t) => [t.name, t]),
  )
}

describe('payment recovery readiness', () => {
  it('tells the agent to check readiness on get_account', () => {
    const { get_account } = toolsByName(makeClient())
    expect(get_account.description).toContain('paymentRecovery.readiness')
    expect(get_account.description).toContain('blockers')
    expect(get_account.description).toContain('NO_RECOVERY_LINK')
  })

  it('warns that publishing and enabling are refused on NO_RECOVERY_LINK and names a fix tool that exists', () => {
    const byName = toolsByName(makeClient())
    for (const name of ['publish_recovery_blueprint', 'set_recovery_blueprint_enabled']) {
      expect(byName[name].description).toContain('NO_RECOVERY_LINK')
      expect(byName[name].description).toContain('set_hosted_subdomain')
    }
    expect(byName.set_hosted_subdomain).toBeDefined()
  })

  it('mentions readiness on get_recovery_blueprint and the recovery-link note on get_dns_config', () => {
    const byName = toolsByName(makeClient())
    expect(byName.get_recovery_blueprint.description).toContain('readiness')
    expect(byName.get_dns_config.description).toContain('recovery')
  })

  it('passes readiness through untouched, and still works when the API omits it', async () => {
    const withReadiness = makeClient({ org: { id: 'o1' }, paymentRecovery: { readiness } })
    await expect(toolsByName(withReadiness).get_account.handler({})).resolves.toEqual({
      org: { id: 'o1' },
      paymentRecovery: { readiness },
    })

    const without = makeClient({ org: { id: 'o1' } })
    await expect(toolsByName(without).get_account.handler({})).resolves.toEqual({ org: { id: 'o1' } })
  })
})
