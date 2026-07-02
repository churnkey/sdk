import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { settingsTools } from '../../src/tools/settings'

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as ChurnkeyClient
}

describe('settings tools', () => {
  it('registers reads as read-only and writes as destructive with confirm literals', () => {
    const tools = settingsTools(makeClient())
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))
    expect(byName.get_stripe_settings.annotations.readOnlyHint).toBe(true)
    expect(byName.get_adaptive_offers.annotations.readOnlyHint).toBe(true)
    expect(byName.update_stripe_settings.annotations.destructiveHint).toBe(true)
    expect(byName.update_adaptive_offers.annotations.destructiveHint).toBe(true)

    expect(() => byName.update_stripe_settings.inputSchema.parse({ updates: { stackCoupons: true } })).toThrow()
    expect(() => byName.update_adaptive_offers.inputSchema.parse({ enabled: true })).toThrow()
  })

  it('requires at least one setting in update_stripe_settings and rejects unknown keys', () => {
    const [, update] = settingsTools(makeClient())
    expect(() => update.inputSchema.parse({ confirm: 'update_stripe_settings', updates: {} })).toThrow()
    expect(() => update.inputSchema.parse({ confirm: 'update_stripe_settings', updates: { nonsense: true } })).toThrow()
  })

  it('posts updates to the settings endpoints', async () => {
    const client = makeClient()
    const tools = settingsTools(client)
    const update = tools.find((t) => t.name === 'update_adaptive_offers')
    if (!update) throw new Error('tool missing')
    const args = update.inputSchema.parse({
      confirm: 'update_adaptive_offers',
      strategy: 'balanced',
      percentAmountRange: { min: 20, max: 40 },
    })
    await update.handler(args)
    expect(client.post).toHaveBeenCalledWith('/data/adaptive-offers', { body: args })
  })
})
