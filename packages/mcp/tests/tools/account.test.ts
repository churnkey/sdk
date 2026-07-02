import { describe, expect, it, vi } from 'vitest'
import type { ChurnkeyClient } from '../../src/client'
import { accountTools } from '../../src/tools/account'

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({ org: { id: 'o1', name: 'Acme' }, mode: 'LIVE' }),
  } as unknown as ChurnkeyClient
}

describe('get_account', () => {
  it('is a read-only, mode-agnostic identity tool hitting /data/account', async () => {
    const client = makeClient()
    const [tool] = accountTools(client)
    expect(tool.name).toBe('get_account')
    expect(tool.annotations?.readOnlyHint).toBe(true)
    // It REPORTS the mode, so it must not itself be mode-scoped (no mode echo on it).
    expect(tool.modeScoped).toBeUndefined()

    await tool.handler(tool.inputSchema.parse({}))
    expect(client.get).toHaveBeenCalledWith('/data/account')
  })

  it('takes no input', () => {
    const [tool] = accountTools(makeClient())
    expect(() => tool.inputSchema.parse({})).not.toThrow()
  })
})
