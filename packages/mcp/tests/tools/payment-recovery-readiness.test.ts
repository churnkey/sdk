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
    expect(get_account.description).toContain('set_hosted_subdomain (works immediately) or a custom domain')
    expect(get_account.description).not.toContain('live custom domain')
    // A registered custom domain satisfies readiness before it resolves.
    expect(get_account.description).toContain('counts as soon as add_custom_domain registers it')
    expect(get_account.description).toContain('check_domain_status')
    expect(get_account.description).toContain('would fail to send')
    expect(get_account.description).not.toContain('without a working payment link')
    expect(get_account.description).toContain('`readiness` is null when it could not be computed')
  })

  it('warns that publishing and enabling are refused on NO_RECOVERY_LINK and names a fix tool that exists', () => {
    const byName = toolsByName(makeClient())
    for (const name of ['publish_recovery_blueprint', 'set_recovery_blueprint_enabled']) {
      expect(byName[name].description).toContain('NO_RECOVERY_LINK')
      expect(byName[name].description).toContain('set_hosted_subdomain')
    }
    expect(byName.set_hosted_subdomain).toBeDefined()
    expect(byName.add_custom_domain).toBeDefined()
    expect(byName.check_domain_status).toBeDefined()
  })

  it('qualifies the publish refusal to enabled campaigns and tells the enable path to retry itself', () => {
    const byName = toolsByName(makeClient())
    const publish = byName.publish_recovery_blueprint.description
    const enable = byName.set_recovery_blueprint_enabled.description
    expect(publish).toContain('when the campaign is enabled')
    expect(publish).toContain('A disabled campaign')
    for (const description of [publish, enable]) {
      expect(description).toContain('would fail to send')
      expect(description).not.toContain('without a working payment link')
      expect(description).toContain('wait until check_domain_status reports it live')
      expect(description).toContain('retry the same call')
    }
    expect(enable).toContain('Retry this enable call, not publish_recovery_blueprint')
  })

  it('asks the agent to agree the hosted subdomain with the user first', () => {
    const { set_hosted_subdomain } = toolsByName(makeClient())
    expect(set_hosted_subdomain.description).toContain('agree the name with the user first')
  })

  it('mentions readiness on get_recovery_blueprint and the recovery-link note on get_dns_config', () => {
    const byName = toolsByName(makeClient())
    expect(byName.get_recovery_blueprint.description).toContain('readiness')
    expect(byName.get_dns_config.description).toContain('recovery')
    // The API adds the note only when no custom domain is configured at all, whatever its status.
    expect(byName.get_dns_config.description).toContain('no subdomain and no custom domain configured')
    expect(byName.get_dns_config.description).not.toContain('live custom domain')
    expect(byName.get_dns_config.description).toContain('`recoveryLinkNote`')
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
