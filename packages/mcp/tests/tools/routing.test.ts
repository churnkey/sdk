import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { routingTools } from '../../src/tools/routing'

function findTool(name: string) {
  const get = vi.fn()
  const post = vi.fn()
  const client = { get, post } as unknown as ChurnkeyClient
  const tool = routingTools(client).find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return { tool, get, post }
}

const rule = { attribute: 'BILLING_INTERVAL', operand: 'INCLUDES' as const, value: ['MONTH'] }

describe('routingTools', () => {
  it('routes test_routing to the product it names, in the session mode', async () => {
    const { tool, post } = findTool('test_routing')

    await tool.handler({ product: 'cancel_flows', id: 'cus_1' })
    await tool.handler({ product: 'payment_recovery', id: 'sub_1' })

    expect(post).toHaveBeenNthCalledWith(1, '/data/segments/test-routing', { body: { id: 'cus_1' } })
    expect(post).toHaveBeenNthCalledWith(2, '/data/payment-recovery/test-routing', { body: { id: 'sub_1' } })
    expect(tool.modeScoped).toBe(true)
    expect(tool.annotations?.readOnlyHint).toBe(true)
    expect(() => tool.inputSchema.parse({ product: 'cancel_flows', id: '' })).toThrow()
  })

  it("sends estimate_audience the id its product's endpoint reads", async () => {
    const { tool, post } = findTool('estimate_audience')

    await tool.handler({ product: 'cancel_flows', filter: [rule], segmentId: 'seg_1', blueprintId: 'ignored' })
    await tool.handler({ product: 'payment_recovery', filter: [rule], blueprintId: 'bp_1' })

    expect(post).toHaveBeenNthCalledWith(1, '/data/segments/estimate', {
      body: { filter: [rule], segmentId: 'seg_1' },
    })
    expect(post).toHaveBeenNthCalledWith(2, '/data/payment-recovery/estimate', {
      body: { filter: [rule], blueprintId: 'bp_1' },
    })
    expect(() => tool.inputSchema.parse({ product: 'cancel_flows', filter: [] })).toThrow()
    expect(() => tool.inputSchema.parse({ product: 'cancel_flows', filter: [{ ...rule, operand: 'GT' }] })).toThrow()
    expect(() =>
      tool.inputSchema.parse({
        product: 'cancel_flows',
        filter: [{ attribute: 'SUBSCRIPTION_AGE_MONTHS', operand: 'LT', value: [2] }],
      }),
    ).not.toThrow()
  })

  it('reads recommend_segments from the cancel flow recommendations endpoint without writing', async () => {
    const { tool, get, post } = findTool('recommend_segments')

    await tool.handler({})

    expect(get).toHaveBeenCalledWith('/data/segments/recommendations')
    expect(post).not.toHaveBeenCalled()
    expect(tool.annotations?.readOnlyHint).toBe(true)
  })
})
