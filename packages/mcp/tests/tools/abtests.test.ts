import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { abTestTools } from '../../src/tools/abtests'

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as ChurnkeyClient
}

describe('A/B test tools', () => {
  it('marks lifecycle writes destructive and confirm-gated', () => {
    const byName = Object.fromEntries(abTestTools(makeClient()).map((t) => [t.name, t]))
    expect(byName.list_ab_tests.annotations.readOnlyHint).toBe(true)
    expect(byName.get_ab_test_metrics.annotations.readOnlyHint).toBe(true)
    for (const name of ['start_ab_test', 'pause_ab_test', 'complete_ab_test', 'pick_ab_test_winner']) {
      expect(byName[name].annotations.destructiveHint).toBe(true)
    }
    expect(() => byName.pick_ab_test_winner.inputSchema.parse({ abTestId: 'a', winnerSegmentId: 's' })).toThrow()
  })

  it('accepts only enrollment windows the API allows', () => {
    const byName = Object.fromEntries(abTestTools(makeClient()).map((t) => [t.name, t]))
    const create = (enrollmentDays: number) =>
      byName.create_ab_test.inputSchema.parse({ confirm: 'create_ab_test', segmentId: 'seg1', enrollmentDays })

    expect(create(7).enrollmentDays).toBe(7)
    expect(create(120).enrollmentDays).toBe(120)
    expect(() => create(6)).toThrow()
    expect(() => create(121)).toThrow()
  })

  it('routes winner picks with id in path and decision fields in body', async () => {
    const client = makeClient()
    const byName = Object.fromEntries(abTestTools(client).map((t) => [t.name, t]))
    const args = byName.pick_ab_test_winner.inputSchema.parse({
      confirm: 'pick_winner',
      abTestId: 'ab1',
      winnerSegmentId: 'seg2',
      rationale: '95% confidence on save rate',
      acknowledgeEarlyDecision: true,
    })
    await byName.pick_ab_test_winner.handler(args)
    expect(client.post).toHaveBeenCalledWith('/data/ab-tests/ab1/winner', {
      body: {
        confirm: 'pick_winner',
        winnerSegmentId: 'seg2',
        rationale: '95% confidence on save rate',
        acknowledgeEarlyDecision: true,
      },
    })
  })
})
