import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { paymentRecoveryTools } from '../../src/tools/payment-recovery'

// Mirrors the dunning audience-attribute palette shape that
// list_recovery_audience_attributes returns (built-in + org custom attributes).
const AUDIENCE_CATALOG = {
  builtIn: [{ attribute: 'PAYMENT_DECLINE_TYPE' }, { attribute: 'INVOICE_AMOUNT_DUE' }],
  custom: [{ attribute: 'plan_tier' }],
}

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue(AUDIENCE_CATALOG),
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

describe('payment recovery parity tools (XDEV-2332 follow-up)', () => {
  it('exposes the parity tool set with correct annotations', () => {
    const byName = Object.fromEntries(paymentRecoveryTools(makeClient()).map((t) => [t.name, t]))
    expect(byName.list_recovery_audience_attributes.annotations.readOnlyHint).toBe(true)
    for (const name of [
      'update_recovery_email_offers',
      'update_recovery_sms',
      'add_recovery_email',
      'update_recovery_audience',
    ]) {
      expect(byName[name].annotations.readOnlyHint).toBe(false)
      expect(byName[name].annotations.destructiveHint).toBe(false)
    }
    for (const name of ['remove_recovery_email', 'set_recovery_blueprint_enabled']) {
      expect(byName[name].annotations.destructiveHint).toBe(true)
    }
    // confirm literals required
    expect(() => byName.remove_recovery_email.inputSchema.parse({ blueprintId: 'b', emailGuid: 'g' })).toThrow()
    expect(() =>
      byName.set_recovery_blueprint_enabled.inputSchema.parse({ blueprintId: 'b', enabled: false }),
    ).toThrow()
  })

  it('routes offers with null-to-remove semantics', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(paymentRecoveryTools(client).map((t) => [t.name, t]))
    const args = byName.update_recovery_email_offers.inputSchema.parse({
      blueprintId: 'bp1',
      emailGuid: 'g1',
      discount: { couponId: 'SAVE20' },
      invoiceDiscount: null,
    })
    await byName.update_recovery_email_offers.handler(args)
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/email/g1/offers', {
      body: { discount: { couponId: 'SAVE20' }, invoiceDiscount: null },
    })
    expect(() =>
      byName.update_recovery_email_offers.inputSchema.parse({
        blueprintId: 'b',
        emailGuid: 'g',
        invoiceDiscount: { type: 'PERCENT', amount: -5 },
      }),
    ).toThrow()
  })

  it('routes SMS updates on the shared step guid', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(paymentRecoveryTools(client).map((t) => [t.name, t]))
    const args = byName.update_recovery_sms.inputSchema.parse({
      blueprintId: 'bp1',
      emailGuid: 'g1',
      updates: { enabled: true, sendOnDay: 2 },
    })
    await byName.update_recovery_sms.handler(args)
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/sms/g1', {
      body: { updates: { enabled: true, sendOnDay: 2 } },
    })
    expect(() =>
      byName.update_recovery_sms.inputSchema.parse({ blueprintId: 'b', emailGuid: 'g', updates: {} }),
    ).toThrow()
  })

  it('routes add/remove and audience edits', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(paymentRecoveryTools(client).map((t) => [t.name, t]))

    await byName.add_recovery_email.handler(byName.add_recovery_email.inputSchema.parse({ blueprintId: 'bp1' }))
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/emails', { body: {} })

    await byName.remove_recovery_email.handler(
      byName.remove_recovery_email.inputSchema.parse({
        confirm: 'remove_recovery_email',
        blueprintId: 'bp1',
        emailGuid: 'g2',
      }),
    )
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/email/g2/remove', {
      body: { confirm: 'remove_recovery_email' },
    })

    await byName.update_recovery_audience.handler(
      byName.update_recovery_audience.inputSchema.parse({
        blueprintId: 'bp1',
        name: 'Hard declines',
        filters: [{ attribute: 'PAYMENT_DECLINE_TYPE', operand: 'INCLUDES', value: ['hard'] }],
      }),
    )
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/audience', {
      body: {
        name: 'Hard declines',
        filters: [{ attribute: 'PAYMENT_DECLINE_TYPE', operand: 'INCLUDES', value: ['hard'] }],
      },
    })

    await byName.set_recovery_blueprint_enabled.handler(
      byName.set_recovery_blueprint_enabled.inputSchema.parse({
        confirm: 'set_recovery_blueprint_enabled',
        blueprintId: 'bp1',
        enabled: false,
      }),
    )
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/enabled', {
      body: { confirm: 'set_recovery_blueprint_enabled', enabled: false },
    })
  })

  it('fail-fast rejects unknown audience filter attributes before the update (XDEV-2380)', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(paymentRecoveryTools(client).map((t) => [t.name, t]))
    const tool = byName.update_recovery_audience

    await expect(
      tool.handler(
        tool.inputSchema.parse({
          blueprintId: 'bp1',
          filters: [{ attribute: 'NOT_A_REAL_ATTRIBUTE', operand: 'INCLUDES', value: ['x'] }],
        }),
      ),
    ).rejects.toThrow(/NOT_A_REAL_ATTRIBUTE.*not a known attribute.*list_recovery_audience_attributes/s)
    // Caught the typo before issuing the update.
    expect(client.post).not.toHaveBeenCalled()
  })

  it('fail-fast allows valid built-in and org custom filter attributes', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(paymentRecoveryTools(client).map((t) => [t.name, t]))
    const tool = byName.update_recovery_audience

    await tool.handler(
      tool.inputSchema.parse({
        blueprintId: 'bp1',
        filters: [
          { attribute: 'PAYMENT_DECLINE_TYPE', operand: 'INCLUDES', value: ['hard'] },
          { attribute: 'plan_tier', operand: 'INCLUDES', value: ['pro'], type: 'STRING' },
        ],
      }),
    )
    expect(client.get).toHaveBeenCalledWith('/data/payment-recovery/audience-attributes')
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/audience', {
      body: {
        filters: [
          { attribute: 'PAYMENT_DECLINE_TYPE', operand: 'INCLUDES', value: ['hard'] },
          { attribute: 'plan_tier', operand: 'INCLUDES', value: ['pro'], type: 'STRING' },
        ],
      },
    })
  })

  it('skips the catalog fetch for rename-only audience edits', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(paymentRecoveryTools(client).map((t) => [t.name, t]))
    const tool = byName.update_recovery_audience

    await tool.handler(tool.inputSchema.parse({ blueprintId: 'bp1', name: 'Renamed only' }))
    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/data/payment-recovery/blueprints/bp1/audience', {
      body: { name: 'Renamed only' },
    })
  })

  it('caps audience name at 60 chars like the dashboard', () => {
    const byName = Object.fromEntries(paymentRecoveryTools(makeClient()).map((t) => [t.name, t]))
    expect(() =>
      byName.update_recovery_audience.inputSchema.parse({ blueprintId: 'b', name: 'n'.repeat(61) }),
    ).toThrow()
  })
})
