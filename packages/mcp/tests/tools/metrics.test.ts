import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { metricsTools } from '../../src/tools/metrics'

function makeClient() {
  return { get: vi.fn().mockResolvedValue({ totalSessions: 1 }) } as unknown as ChurnkeyClient
}

describe('get_flow_metrics', () => {
  it('maps abtestId to the API abtest param and passes scope through', async () => {
    const client = makeClient()
    const [tool] = metricsTools(client)
    expect(tool.name).toBe('get_flow_metrics')
    expect(tool.annotations.readOnlyHint).toBe(true)

    const args = tool.inputSchema.parse({
      segmentId: 'seg1',
      blueprintId: 'bp1',
      abtestId: 'ab1',
      startDate: '2026-01-01',
    })
    await tool.handler(args)

    expect(client.get).toHaveBeenCalledWith('/data/flow-metrics', {
      query: { segmentId: 'seg1', blueprintId: 'bp1', abtest: 'ab1', startDate: '2026-01-01', endDate: undefined },
    })
  })

  it('accepts an empty scope (org-wide metrics)', () => {
    const [tool] = metricsTools(makeClient())
    expect(() => tool.inputSchema.parse({})).not.toThrow()
  })
})
