import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { paymentRecoveryTools } from '../../src/tools/payment-recovery'

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as ChurnkeyClient
}

describe('payment recovery tools', () => {
  it('marks live-impacting tools destructive and confirm-gated', () => {
    const byName = Object.fromEntries(paymentRecoveryTools(makeClient()).map((t) => [t.name, t]))
    expect(byName.publish_recovery_blueprint.annotations.destructiveHint).toBe(true)
    expect(byName.stop_recovery_campaign.annotations.destructiveHint).toBe(true)
    expect(byName.list_recovery_campaigns.annotations.readOnlyHint).toBe(true)

    expect(() => byName.publish_recovery_blueprint.inputSchema.parse({ blueprintId: 'b1' })).toThrow()
    expect(() => byName.stop_recovery_campaign.inputSchema.parse({ campaignId: 'c1' })).toThrow()
  })

  it('routes email edits with ids in the path and updates in the body', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(paymentRecoveryTools(client).map((t) => [t.name, t]))

    const args = byName.update_recovery_email.inputSchema.parse({
      blueprintId: 'bp1',
      emailGuid: 'guid-1',
      updates: { subject: 'Pay up (nicely)' },
    })
    await byName.update_recovery_email.handler(args)
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/email/guid-1', {
      body: { updates: { subject: 'Pay up (nicely)' } },
    })

    const stopArgs = byName.stop_recovery_campaign.inputSchema.parse({
      confirm: 'stop_campaign',
      campaignId: 'c1',
      reason: 'support request',
    })
    await byName.stop_recovery_campaign.handler(stopArgs)
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/campaigns/c1/stop', {
      body: { confirm: 'stop_campaign', reason: 'support request' },
    })
  })

  it('rejects empty update objects', () => {
    const byName = Object.fromEntries(paymentRecoveryTools(makeClient()).map((t) => [t.name, t]))
    expect(() =>
      byName.update_recovery_email.inputSchema.parse({ blueprintId: 'b', emailGuid: 'g', updates: {} }),
    ).toThrow()
  })
})
