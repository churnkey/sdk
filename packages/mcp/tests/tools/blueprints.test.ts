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
        updates: { steps: [{ stepType: 'SURVEY' }] },
      }),
    ).toThrow()
  })

  it('validates brandImage against the server image rules', () => {
    const { tool } = findTool('update_blueprint_draft')
    const parseBrandImage = (brandImage: string) =>
      tool.inputSchema.parse({ blueprintId: 'bp_123', updates: { brandImage } })

    // Allowed raster extensions and churnkey.co-hosted images pass.
    expect(() => parseBrandImage('https://example.com/brand.png')).not.toThrow()
    expect(() => parseBrandImage('https://cdn.example.com/a/b/logo.webp')).not.toThrow()
    expect(() => parseBrandImage('https://images.churnkey.co/abc123')).not.toThrow()

    // SVG, other extensions, extension-less URLs, and non-URLs are rejected (matching the server).
    expect(() => parseBrandImage('https://example.com/logo.svg')).toThrow()
    expect(() => parseBrandImage('https://example.com/logo')).toThrow()
    expect(() => parseBrandImage('not-a-url')).toThrow()
  })

  it('routes update_blueprint_step with a compact step patch body', async () => {
    const { tool, post } = findTool('update_blueprint_step')
    const updates = {
      header: 'New header',
      offer: { description: 'New offer description' },
      surveyChoices: [{ choiceGuid: 'choice_123', value: 'Too expensive', followupQuestion: 'What price works?' }],
    }

    await tool.handler({ blueprintId: 'bp_123', stepGuid: 'step_123', updates })

    expect(post).toHaveBeenCalledWith('/data/blueprints/bp_123/step', {
      body: { stepGuid: 'step_123', stepIndex: undefined, updates },
    })
  })

  it('requires one step selector and supported step patch fields', () => {
    const { tool } = findTool('update_blueprint_step')

    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        stepGuid: 'step_123',
        updates: { header: 'New header', enabled: true },
      }),
    ).not.toThrow()

    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        updates: { header: 'New header' },
      }),
    ).not.toThrow()

    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        stepGuid: 'step_123',
        updates: { steps: [] },
      }),
    ).toThrow()

    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        stepGuid: 'step_123',
        updates: { surveyChoices: [{ choiceGuid: 'choice_123', label: 'Nope' }] },
      }),
    ).toThrow()

    // Empty-string guids are rejected rather than silently treated as "absent".
    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        stepGuid: '',
        updates: { header: 'New header' },
      }),
    ).toThrow()
  })

  it('requires exactly one step selector before routing update_blueprint_step', async () => {
    const { tool, post } = findTool('update_blueprint_step')

    await expect(tool.handler({ blueprintId: 'bp_123', updates: { header: 'New header' } })).rejects.toThrow(
      'Pass exactly one of stepGuid or stepIndex.',
    )
    await expect(
      tool.handler({ blueprintId: 'bp_123', stepGuid: 'step_123', stepIndex: 0, updates: { header: 'New header' } }),
    ).rejects.toThrow('Pass exactly one of stepGuid or stepIndex.')
    expect(post).not.toHaveBeenCalled()
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

  it('accepts survey/freeform/confirm behavioral config on update_blueprint_step', () => {
    const { tool } = findTool('update_blueprint_step')

    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        stepGuid: 'step_123',
        updates: { survey: { randomize: true, minLength: 20 }, confirmConfig: { discountNotice: true } },
      }),
    ).not.toThrow()
    // unknown nested key rejected
    expect(() =>
      tool.inputSchema.parse({
        blueprintId: 'bp_123',
        stepGuid: 'step_123',
        updates: { survey: { shuffle: true } },
      }),
    ).toThrow()
  })

  it('routes update_blueprint_offer and requires choiceGuid for optionGuid', async () => {
    const { tool, post } = findTool('update_blueprint_offer')

    await tool.handler({
      blueprintId: 'bp_123',
      stepGuid: 'step_1',
      offerType: 'DISCOUNT',
      config: { customAmount: 1500, customDuration: 'ONCE' },
    })
    expect(post).toHaveBeenCalledWith('/data/blueprints/bp_123/offer', {
      body: { stepGuid: 'step_1', offerType: 'DISCOUNT', config: { customAmount: 1500, customDuration: 'ONCE' } },
    })

    await expect(
      tool.handler({ blueprintId: 'bp_123', stepGuid: 'step_1', optionGuid: 'opt_1', config: {} }),
    ).rejects.toThrow('optionGuid requires choiceGuid.')
  })

  it('accepts currency-specific rebate configuration', async () => {
    const { tool, post } = findTool('update_blueprint_offer')
    const input = {
      blueprintId: 'bp_123',
      stepGuid: 'step_1',
      offerType: 'REBATE' as const,
      config: {
        amountType: 'FIXED' as const,
        fixedAmounts: [
          { currency: 'USD', amountMinor: 5000 },
          { currency: 'eur', amountMinor: 4500 },
        ],
        mbgWindowDays: 30,
        invoiceScope: 'LATEST_PAID' as const,
      },
    }

    const parsed = tool.inputSchema.parse(input)
    await tool.handler(parsed)
    expect(post).toHaveBeenCalledWith('/data/blueprints/bp_123/offer', {
      body: {
        stepGuid: 'step_1',
        offerType: 'REBATE',
        config: {
          ...input.config,
          fixedAmounts: [
            { currency: 'usd', amountMinor: 5000 },
            { currency: 'eur', amountMinor: 4500 },
          ],
        },
      },
    })
    expect(() =>
      tool.inputSchema.parse({
        ...input,
        config: { fixedAmounts: [{ currency: 'US', amountMinor: 5000 }] },
      }),
    ).toThrow()
    expect(() =>
      tool.inputSchema.parse({
        ...input,
        config: {
          fixedAmounts: [
            { currency: 'usd', amountMinor: 5000 },
            { currency: 'USD', amountMinor: 4500 },
          ],
        },
      }),
    ).toThrow()
  })

  it('routes edit_survey_structure with the op body', async () => {
    const { tool, post } = findTool('edit_survey_structure')

    await tool.handler({ blueprintId: 'bp_123', op: 'add_choice', stepGuid: 'step_1', value: 'Too pricey' })
    expect(post).toHaveBeenCalledWith('/data/blueprints/bp_123/survey', {
      body: { op: 'add_choice', stepGuid: 'step_1', value: 'Too pricey' },
    })
  })

  it('routes add_blueprint_step and remove_blueprint_step', async () => {
    const add = findTool('add_blueprint_step')
    await add.tool.handler({ blueprintId: 'bp_123', place: 'FINAL_OFFER' })
    expect(add.post).toHaveBeenCalledWith('/data/blueprints/bp_123/step/add', { body: { place: 'FINAL_OFFER' } })

    const remove = findTool('remove_blueprint_step')
    await remove.tool.handler({ blueprintId: 'bp_123', stepGuid: 'step_9' })
    expect(remove.post).toHaveBeenCalledWith('/data/blueprints/bp_123/step/remove', { body: { stepGuid: 'step_9' } })

    // place must be a known slot
    expect(() => add.tool.inputSchema.parse({ blueprintId: 'bp_123', place: 'MIDDLE' })).toThrow()
  })
})
