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
})
