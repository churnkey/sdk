import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { allTools } from '../../src/tools'

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as ChurnkeyClient
}

// Directory reviewers read annotations as the contract for what a tool does.
// Anthropic accepts a title plus readOnlyHint or destructiveHint; OpenAI wants
// all three hints on every tool and snapshots them at submission time, so a
// tool added without the full set fails their scan rather than ours. These
// assertions cover the whole registry so that lands here instead.
describe('tool annotations', () => {
  const tools = allTools(makeClient())

  it('gives every tool a title and all three hints', () => {
    for (const tool of tools) {
      expect(tool.title, `${tool.name} is missing a title`).toBeTruthy()
      expect(typeof tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe('boolean')
      expect(typeof tool.annotations?.destructiveHint, `${tool.name} destructiveHint`).toBe('boolean')
      expect(typeof tool.annotations?.openWorldHint, `${tool.name} openWorldHint`).toBe('boolean')
    }
  })

  it('never marks a tool both read-only and destructive', () => {
    for (const tool of tools) {
      if (tool.annotations?.readOnlyHint) {
        expect(tool.annotations.destructiveHint, `${tool.name} claims read-only and destructive`).toBe(false)
      }
    }
  })

  it('keeps tool names within the 64-character directory limit', () => {
    for (const tool of tools) {
      expect(tool.name.length, `${tool.name} is ${tool.name.length} chars`).toBeLessThanOrEqual(64)
    }
  })

  it('registers each tool name once', () => {
    const names = tools.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
