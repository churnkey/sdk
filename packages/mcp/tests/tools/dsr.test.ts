import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { allTools } from '../../src/tools'
import { dsrTools } from '../../src/tools/dsr'

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  } as unknown as ChurnkeyClient
}

describe('dsr tools', () => {
  it('exposes right-to-know as a read, and routes it to the access endpoint', async () => {
    const client = makeClient()
    const [access] = dsrTools(client)

    expect(access.name).toBe('dsr_access')
    expect(access.annotations?.readOnlyHint).toBe(true)
    expect(access.annotations?.destructiveHint).toBe(false)

    await access.handler(access.inputSchema.parse({ email: 'someone@example.com' }))
    expect(client.post).toHaveBeenCalledWith('/data/dsr/access', { body: { email: 'someone@example.com' } })
  })

  // Guards the absence, so re-adding a deletion tool has to argue past this
  // first. Reasoning is on dsrTools in src/tools/dsr.ts.
  it('ships no tool that erases customer data', () => {
    const names = allTools(makeClient()).map((t) => t.name)
    expect(names.filter((n) => n.startsWith('dsr_'))).toEqual(['dsr_access'])
  })
})
