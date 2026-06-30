import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Inject a fake tool so we can exercise the registered-tool handler (the base reslice
// ships zero tools, so allTools() returns []). The tool factory captures the ChurnkeyClient
// instance createServer builds, so tests can drive it / read lastActingOrg.
const handler = vi.fn()
const modeReadHandler = vi.fn()
const modeWriteHandler = vi.fn()
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
      // A mode-scoped READ tool — should echo the mode and get the data note.
      {
        name: 'mode_read_tool',
        title: 'Mode read',
        description: 'reads runtime data',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
        modeScoped: true,
        handler: modeReadHandler,
      },
      // A mode-scoped WRITE tool — should echo the mode and get the traffic note.
      {
        name: 'mode_write_tool',
        title: 'Mode write',
        description: 'affects live traffic',
        inputSchema: z.object({}),
        annotations: { readOnlyHint: false, destructiveHint: true },
        modeScoped: true,
        handler: modeWriteHandler,
      },
    ]
  },
}))

import type { ChurnkeyClient } from '../src/client'
import { createServer, SERVER_NAME, SERVER_VERSION } from '../src/server'
import { MODE_DATA_NOTE, MODE_TRAFFIC_NOTE } from '../src/tools/shared'

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

/** Read the description the server registered for a tool (post mode-note suffix). */
function getToolDescription(server: ReturnType<typeof createServer>, name: string): string {
  const anyServer = server as unknown as Record<string, any>
  return anyServer._registeredTools?.[name]?.description as string
}

afterEach(() => {
  handler.mockReset()
  modeReadHandler.mockReset()
  modeWriteHandler.mockReset()
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

describe('mode-scoped tools', () => {
  it('does NOT echo a mode line for a non-mode-scoped tool', async () => {
    handler.mockResolvedValue({ ok: true })
    const server = createServer(config)
    const res = await getToolCallback(server, 'echo_tool')({ value: 'x' }, {})
    expect(res.content.some((c: any) => /^Mode:/.test(c.text))).toBe(false)
  })

  it('echoes LIVE on a mode-scoped tool when no test mode is set', async () => {
    modeReadHandler.mockResolvedValue({ rows: [] })
    const server = createServer(config) // no mode → live
    const res = await getToolCallback(server, 'mode_read_tool')({}, {})
    const modeLine = res.content.find((c: any) => c.text.startsWith('Mode:'))
    expect(modeLine?.text).toContain('Mode: LIVE')
    expect(modeLine?.text).toContain('live mode')
  })

  it('echoes TEST on a mode-scoped tool when the session is in test mode', async () => {
    modeReadHandler.mockResolvedValue({ rows: [] })
    const server = createServer({ ...config, mode: 'test' })
    const res = await getToolCallback(server, 'mode_read_tool')({}, {})
    const modeLine = res.content.find((c: any) => c.text.startsWith('Mode:'))
    expect(modeLine?.text).toContain('Mode: TEST')
    expect(modeLine?.text).toContain('test mode')
  })

  it('appends the data note to a mode-scoped read description, and the traffic note to a write', () => {
    const server = createServer(config)
    const readDesc = getToolDescription(server, 'mode_read_tool')
    const writeDesc = getToolDescription(server, 'mode_write_tool')
    expect(readDesc).toContain(MODE_DATA_NOTE)
    expect(readDesc).not.toContain(MODE_TRAFFIC_NOTE)
    expect(writeDesc).toContain(MODE_TRAFFIC_NOTE)
    expect(writeDesc).not.toContain(MODE_DATA_NOTE)
  })

  it('leaves a non-mode-scoped tool description untouched', () => {
    const server = createServer(config)
    expect(getToolDescription(server, 'echo_tool')).toBe('echoes')
  })
})
