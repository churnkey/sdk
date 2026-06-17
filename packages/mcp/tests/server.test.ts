import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Inject a fake tool so we can exercise the registered-tool handler (the base reslice
// ships zero tools, so allTools() returns []). The tool factory captures the ChurnkeyClient
// instance createServer builds, so tests can drive it / read lastActingOrg.
const handler = vi.fn()
let capturedClient: ChurnkeyClient | undefined
vi.mock('../src/tools', () => ({
  allTools: (client: ChurnkeyClient) => {
    capturedClient = client
    return [
      {
        name: 'echo_tool',
        title: 'Echo',
        description: 'echoes',
        inputSchema: z.object({ value: z.string() }),
        annotations: { readOnlyHint: true },
        handler,
      },
    ]
  },
}))

import type { ChurnkeyClient } from '../src/client'
import { createServer, SERVER_NAME, SERVER_VERSION } from '../src/server'

const config = {
  baseUrl: 'https://api.example.com/v1',
  auth: { kind: 'data-api-key' as const, appId: 'a', apiKey: 'k' },
}

/** Reach into the McpServer to invoke a registered tool's wrapped handler directly. */
function getToolCallback(server: ReturnType<typeof createServer>, name: string) {
  const anyServer = server as unknown as Record<string, any>
  const registered = anyServer._registeredTools?.[name]
  return registered?.handler as (args: unknown, extra?: unknown) => Promise<{ content: any[]; isError?: boolean }>
}

afterEach(() => {
  handler.mockReset()
  vi.restoreAllMocks()
  // Drop the per-test client reference so no captured state can bleed into the
  // next test (or across files when the runner shares a module registry, e.g.
  // under --coverage); each test re-captures via its own createServer() call.
  capturedClient = undefined
})

describe('server metadata', () => {
  it('exposes a stable name + version', () => {
    expect(SERVER_NAME).toBe('churnkey-mcp')
    expect(SERVER_VERSION).toBe('1.0.0')
  })

  it('builds without throwing for each auth kind', () => {
    expect(() => createServer(config)).not.toThrow()
    expect(() => createServer({ baseUrl: 'https://b/v1', auth: { kind: 'bearer', token: 'ck_oat_x' } })).not.toThrow()
  })
})

describe('server tool wrapper', () => {
  it('parses input, returns the JSON result block, and appends the acting-org block', async () => {
    handler.mockImplementation(async () => ({ ok: true }))
    const server = createServer(config)
    const cb = getToolCallback(server, 'echo_tool')
    expect(cb).toBeTypeOf('function')

    // Simulate the API having captured an acting org on the shared client.
    // The wrapper reads client.lastActingOrg, so set it via a fetch stub on the first call.
    // Simplest: make the handler set it through the captured client is not exposed; instead the
    // wrapper only adds the block if lastActingOrg is present. We assert the base (no-org) shape,
    // then a separate test covers the org block.
    const res = await cb({ value: 'hello' }, {})
    expect(res.isError).toBeFalsy()
    expect(res.content[0]).toEqual({ type: 'text', text: JSON.stringify({ ok: true }, null, 2) })
    expect(handler).toHaveBeenCalledWith({ value: 'hello' })
  })

  it('returns isError content when the tool handler throws', async () => {
    handler.mockImplementation(async () => {
      throw new Error('handler boom')
    })
    const server = createServer(config)
    const cb = getToolCallback(server, 'echo_tool')
    const res = await cb({ value: 'x' }, {})
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('handler boom')
  })

  it('returns isError when our inner re-parse rejects bad input (defense in depth)', async () => {
    // server.ts re-parses args with tool.inputSchema.parse() inside its try/catch. If the SDK's
    // own validation is bypassed (args reach the wrapper malformed), our parse throws → isError.
    handler.mockResolvedValue({ ok: true })
    const server = createServer(config)
    const cb = getToolCallback(server, 'echo_tool')
    const res = await cb({ value: 123 }, {}) // value must be a string
    expect(res.isError).toBe(true)
    expect(handler).not.toHaveBeenCalled()
  })

  it('coerces undefined args to {} before parsing (handler sees empty object for optional schemas)', async () => {
    // Our echo schema requires `value`, so undefined args → parse error → isError. This exercises
    // the `args ?? {}` branch.
    handler.mockResolvedValue({ ok: true })
    const server = createServer(config)
    const cb = getToolCallback(server, 'echo_tool')
    const res = await cb(undefined, {})
    expect(res.isError).toBe(true)
  })

  it('appends the acting-org block when the client recorded one', async () => {
    handler.mockResolvedValue({ done: 1 })
    const server = createServer(config)
    const cb = getToolCallback(server, 'echo_tool')
    // Set the value on the actual client instance the wrapper closes over.
    expect(capturedClient, 'allTools mock must have captured this createServer()’s client').toBeDefined()
    capturedClient!.lastActingOrg = { id: 'org_9', name: 'Widget Co' }
    const res = await cb({ value: 'x' }, {})
    expect(res.content).toHaveLength(2)
    expect(res.content[1].text).toBe('Acting on workspace: Widget Co (org org_9).')
  })

  it('falls back to the org id when no name was captured', async () => {
    handler.mockResolvedValue({ done: 1 })
    const server = createServer(config)
    const cb = getToolCallback(server, 'echo_tool')
    expect(capturedClient, 'allTools mock must have captured this createServer()’s client').toBeDefined()
    capturedClient!.lastActingOrg = { id: 'org_noname' }
    const res = await cb({ value: 'x' }, {})
    expect(res.content[1].text).toBe('Acting on workspace: org_noname (org org_noname).')
  })
})
