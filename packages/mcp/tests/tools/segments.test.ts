import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { segmentTools } from '../../src/tools/segments'

function findTool(name: string) {
  const get = vi.fn()
  const post = vi.fn()
  const client = { get, post } as unknown as ChurnkeyClient
  const tool = segmentTools(client).find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return { tool, get, post }
}

describe('segmentTools', () => {
  it('routes list_segments through the Data API segment list endpoint', async () => {
    const { tool, get } = findTool('list_segments')

    await tool.handler({})

    expect(get).toHaveBeenCalledWith('/data/segments')
  })

  it('routes create_segment_flow with nested segment and blueprint payload', async () => {
    const { tool, post } = findTool('create_segment_flow')
    const args = {
      segment: {
        name: 'MCP test segment',
        filter: [{ attribute: 'PLAN_ID', operand: 'INCLUDES' as const, value: ['price_1'] }],
      },
      blueprint: { template: 'BASIC' as const, name: 'MCP test flow' },
      confirm: 'create_segment_flow' as const,
    }

    await tool.handler(args)

    expect(post).toHaveBeenCalledWith('/data/segments', { body: args })
    expect(() => tool.inputSchema.parse(args)).not.toThrow()
    expect(() => tool.inputSchema.parse({ ...args, blueprint: { template: 'UNKNOWN' } })).toThrow()
    expect(() => tool.inputSchema.parse({ ...args, confirm: 'yes' })).toThrow()
  })

  it('routes reorder_segments with the full confirmed body', async () => {
    const { tool, post } = findTool('reorder_segments')
    const args = { segmentIds: ['seg_1', 'seg_2'], confirm: 'reorder_segments' as const }

    await tool.handler(args)

    expect(post).toHaveBeenCalledWith('/data/segments/reorder', { body: args })
  })

  it('requires non-empty segment IDs and the reorder confirmation literal', () => {
    const { tool } = findTool('reorder_segments')

    expect(() => tool.inputSchema.parse({ segmentIds: ['seg_1', 'seg_2'], confirm: 'reorder_segments' })).not.toThrow()
    expect(() => tool.inputSchema.parse({ segmentIds: [], confirm: 'reorder_segments' })).toThrow()
    expect(() => tool.inputSchema.parse({ segmentIds: ['seg_1'] })).toThrow()
    expect(() => tool.inputSchema.parse({ segmentIds: ['seg_1'], confirm: 'yes' })).toThrow()
  })

  it('routes archive_segment with explicit confirmation', async () => {
    const { tool, post } = findTool('archive_segment')

    await tool.handler({ segmentId: 'seg_1', confirm: 'archive_segment' })

    expect(post).toHaveBeenCalledWith('/data/segments/seg_1/archive', { body: { confirm: 'archive_segment' } })
    expect(() => tool.inputSchema.parse({ segmentId: 'seg_1', confirm: 'archive_segment' })).not.toThrow()
    expect(() => tool.inputSchema.parse({ segmentId: 'seg_1', confirm: 'yes' })).toThrow()
  })

  it('routes set_segment_enabled with the confirmed body', async () => {
    const { tool, post } = findTool('set_segment_enabled')

    await tool.handler({ segmentId: 'seg_1', enabled: false, confirm: 'set_segment_enabled' })
    expect(post).toHaveBeenCalledWith('/data/segments/seg_1/enabled', {
      body: { enabled: false, confirm: 'set_segment_enabled' },
    })

    expect(() => tool.inputSchema.parse({ segmentId: 'seg_1', enabled: false })).toThrow()
    expect(() => tool.inputSchema.parse({ segmentId: 'seg_1', enabled: false, confirm: 'yes' })).toThrow()
  })

  it('routes update_segment_filter and enforces BETWEEN value length', async () => {
    const { tool, post } = findTool('update_segment_filter')
    const filter = [{ attribute: 'PLAN_ID', operand: 'INCLUDES' as const, value: ['price_1'] }]

    await tool.handler({ segmentId: 'seg_1', filter, confirm: 'update_segment_filter' })
    expect(post).toHaveBeenCalledWith('/data/segments/seg_1/filter', {
      body: { filter, confirm: 'update_segment_filter' },
    })

    // BETWEEN needs exactly 2 values
    expect(() =>
      tool.inputSchema.parse({
        segmentId: 'seg_1',
        filter: [{ attribute: 'AGE', operand: 'BETWEEN', value: [1] }],
        confirm: 'update_segment_filter',
      }),
    ).toThrow()
    // unsupported operand rejected
    expect(() =>
      tool.inputSchema.parse({
        segmentId: 'seg_1',
        filter: [{ attribute: 'PLAN_ID', operand: 'EQUAL', value: ['x'] }],
        confirm: 'update_segment_filter',
      }),
    ).toThrow()
    // empty filter (clear all) is allowed
    expect(() =>
      tool.inputSchema.parse({ segmentId: 'seg_1', filter: [], confirm: 'update_segment_filter' }),
    ).not.toThrow()
  })
})
