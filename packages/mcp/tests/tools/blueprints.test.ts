import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { blueprintTools } from '../../src/tools/blueprints'

function createMockClient() {
  const get = vi.fn()
  const post = vi.fn()
  return {
    client: { get, post } as unknown as ChurnkeyClient,
    get,
    post,
  }
}

function findTool(name: string) {
  const { client, get, post } = createMockClient()
  const tool = blueprintTools(client).find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return { tool, get, post }
}

describe('blueprintTools', () => {
  it('routes list_blueprints through the Data API blueprint list endpoint', async () => {
    const { tool, get } = findTool('list_blueprints')

    await tool.handler({})

    expect(get).toHaveBeenCalledWith('/data/blueprints')
  })

  it('routes get_blueprint through the Data API blueprint detail endpoint', async () => {
    const { tool, get } = findTool('get_blueprint')

    await tool.handler({ blueprintId: 'bp_123' })

    expect(get).toHaveBeenCalledWith('/data/blueprints/bp_123')
  })

  it('routes update_blueprint_draft with only the updates payload in the body', async () => {
    const { tool, post } = findTool('update_blueprint_draft')
    const updates = {
      name: 'Updated flow',
      primaryColor: '#123456',
      brandImage: 'https://example.com/brand.png',
      steps: [{ stepType: 'SURVEY' }],
      translatedLanguages: ['es'],
    }

    await tool.handler({ blueprintId: 'bp_123', updates })

    expect(post).toHaveBeenCalledWith('/data/blueprints/bp_123/draft', { body: { updates } })
  })

  it('requires supported draft update fields', () => {
    const { tool } = findTool('update_blueprint_draft')

    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        updates: {
          name: 'Updated flow',
          primaryColor: '#123456',
          brandImage: 'https://example.com/brand.png',
          steps: [{ stepType: 'SURVEY' }],
          translatedLanguages: ['es'],
        },
      }),
    ).not.toThrow()

    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        updates: { brandImage: 'not-a-url' },
      }),
    ).toThrow()

    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        updates: { liveVersion: true },
      }),
    ).toThrow()
  })

  it('routes publish_blueprint only with the explicit confirmation', async () => {
    const { tool, post } = findTool('publish_blueprint')

    await tool.handler({ blueprintId: 'bp_123', confirm: 'publish' })

    expect(post).toHaveBeenCalledWith('/data/blueprints/bp_123/publish', { body: { confirm: 'publish' } })
  })

  it('requires the publish confirmation literal', () => {
    const { tool } = findTool('publish_blueprint')

    expect(() => tool.inputSchema.parse({ blueprintId: 'bp_123', confirm: 'publish' })).not.toThrow()
    expect(() => tool.inputSchema.parse({ blueprintId: 'bp_123' })).toThrow()
    expect(() => tool.inputSchema.parse({ blueprintId: 'bp_123', confirm: 'yes' })).toThrow()
  })
})
