import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { allTools } from '../../src/tools'

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as ChurnkeyClient
}

// OpenAI's directory requires all three hints on every tool and snapshots them
// at submission time, so a tool added without the full set is caught by their
// scan and costs a resubmission. Assert it across the registry instead.
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

  // OpenAI: openWorldHint may be false for a tool confined to a private workspace,
  // and must be true for public or arbitrary destinations. Only the DNS tools
  // act on a public hostname the user supplies; everything else stays inside the
  // org's Churnkey workspace.
  it('marks only the public-hostname DNS tools as open world', () => {
    const openWorld = tools.filter((t) => t.annotations?.openWorldHint).map((t) => t.name)
    expect(openWorld.sort()).toEqual(
      ['add_custom_domain', 'check_domain_status', 'remove_custom_domain', 'set_hosted_subdomain'].sort(),
    )
  })

  // OpenAI counts overwriting as destructive, even when the write only touches a
  // draft and can be undone.
  it('marks tools that overwrite existing content as destructive', () => {
    const overwrites = [
      'update_blueprint_draft',
      'update_blueprint_step',
      'update_blueprint_offer',
      'update_recovery_email',
      'update_recovery_email_offers',
      'update_recovery_sms',
      'update_recovery_audience',
    ]
    for (const name of overwrites) {
      const tool = tools.find((t) => t.name === name)
      expect(tool?.annotations?.destructiveHint, `${name} destructiveHint`).toBe(true)
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
