import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Prevent the real browser from opening: stub child_process.spawn before importing login.
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
}))

import { runLoginFlow } from '../src/auth/login'

const spawnMock = vi.mocked(spawn)

const logs: string[] = []
const log = (m: string) => {
  logs.push(m)
}

function authorizeUrl(): URL {
  const line = logs.find((l) => l.includes('/oauth/authorize'))!
  return new URL(
    line
      .trim()
      .split(/\s+/)
      .find((t) => t.startsWith('http'))!,
  )
}
function redirectFromLogs(): string {
  return authorizeUrl().searchParams.get('redirect_uri')!
}
function stateFromLogs(): string {
  return authorizeUrl().searchParams.get('state')!
}

const realFetch = globalThis.fetch.bind(globalThis)
/** Mock ONLY the token exchange; let real fetch hit the loopback callback. */
function mockTokenEndpoint() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url)
    if (u.includes('/oauth/token')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'ck_oat_login',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'ck_ort_login',
            scope: 'a b',
          }),
          { status: 200 },
        ),
      )
    }
    return realFetch(input, init)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  logs.length = 0
})

describe('runLoginFlow — loopback callback', () => {
  it('completes the flow when the callback returns a valid code + matching state', async () => {
    mockTokenEndpoint()
    const flow = runLoginFlow({ baseUrl: 'https://api.example.com/v1', scopes: ['a', 'b'], log })
    await vi.waitFor(() => expect(logs.some((l) => l.includes('/oauth/authorize'))).toBe(true))
    const res = await realFetch(`${redirectFromLogs()}?code=auth_code_123&state=${encodeURIComponent(stateFromLogs())}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Churnkey MCP is connected')
    const tokens = await flow
    expect(tokens.access_token).toBe('ck_oat_login')
  })

  it('rejects when the callback reports error=access_denied', async () => {
    mockTokenEndpoint()
    const flow = runLoginFlow({ baseUrl: 'https://api.example.com/v1', scopes: ['a'], log })
    // Attach the rejection assertion eagerly so the rejection is never momentarily unhandled.
    const rejection = expect(flow).rejects.toThrow(/denied/i)
    await vi.waitFor(() => expect(logs.some((l) => l.includes('/oauth/authorize'))).toBe(true))
    const res = await realFetch(`${redirectFromLogs()}?error=access_denied`)
    expect(await res.text()).toContain('Authentication failed')
    await rejection
  })

  it('rejects with a generic message for a non-access_denied error', async () => {
    mockTokenEndpoint()
    const flow = runLoginFlow({ baseUrl: 'https://api.example.com/v1', scopes: ['a'], log })
    const rejection = expect(flow).rejects.toThrow(/Authorization failed: server_error/)
    await vi.waitFor(() => expect(logs.some((l) => l.includes('/oauth/authorize'))).toBe(true))
    await realFetch(`${redirectFromLogs()}?error=server_error`)
    await rejection
  })

  it('rejects on a state mismatch', async () => {
    mockTokenEndpoint()
    const flow = runLoginFlow({ baseUrl: 'https://api.example.com/v1', scopes: ['a'], log })
    const rejection = expect(flow).rejects.toThrow(/mismatched state|missing the code/)
    await vi.waitFor(() => expect(logs.some((l) => l.includes('/oauth/authorize'))).toBe(true))
    const res = await realFetch(`${redirectFromLogs()}?code=c&state=wrong_state`)
    expect(res.status).toBe(400)
    await rejection
  })

  it('rejects when code is missing', async () => {
    mockTokenEndpoint()
    const flow = runLoginFlow({ baseUrl: 'https://api.example.com/v1', scopes: ['a'], log })
    const rejection = expect(flow).rejects.toThrow()
    await vi.waitFor(() => expect(logs.some((l) => l.includes('/oauth/authorize'))).toBe(true))
    const res = await realFetch(`${redirectFromLogs()}?state=${encodeURIComponent(stateFromLogs())}`)
    expect(res.status).toBe(400)
    await rejection
  })

  it('opens the browser with the platform-appropriate command', async () => {
    mockTokenEndpoint()
    spawnMock.mockClear()
    const flow = runLoginFlow({ baseUrl: 'https://api.example.com/v1', scopes: ['a'], log })
    await vi.waitFor(() => expect(logs.some((l) => l.includes('/oauth/authorize'))).toBe(true))
    expect(spawnMock).toHaveBeenCalledOnce()
    const [command, args] = spawnMock.mock.calls[0]
    const expected = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
    expect(command).toBe(expected)
    expect((args as string[]).some((a) => a.includes('/oauth/authorize'))).toBe(true)
    // Finish the flow so the loopback server closes.
    await realFetch(`${redirectFromLogs()}?code=ok&state=${encodeURIComponent(stateFromLogs())}`)
    await flow
  })

  it('survives a spawn error (headless env): the flow still completes via the printed URL', async () => {
    mockTokenEndpoint()
    // Make spawn return a child whose 'error' handler fires (covers the .on('error') branch).
    spawnMock.mockImplementationOnce(
      () =>
        ({
          on: (event: string, cb: (e: Error) => void) => {
            if (event === 'error') cb(new Error('no browser'))
          },
          unref: vi.fn(),
        }) as never,
    )
    const flow = runLoginFlow({ baseUrl: 'https://api.example.com/v1', scopes: ['a'], log })
    await vi.waitFor(() => expect(logs.some((l) => l.includes('/oauth/authorize'))).toBe(true))
    await realFetch(`${redirectFromLogs()}?code=ok&state=${encodeURIComponent(stateFromLogs())}`)
    await expect(flow).resolves.toBeTruthy()
  })

  it('returns 404 for non-/callback paths and keeps waiting', async () => {
    mockTokenEndpoint()
    const flow = runLoginFlow({ baseUrl: 'https://api.example.com/v1', scopes: ['a'], log })
    await vi.waitFor(() => expect(logs.some((l) => l.includes('/oauth/authorize'))).toBe(true))
    const origin = new URL(redirectFromLogs()).origin
    const res = await realFetch(`${origin}/favicon.ico`)
    expect(res.status).toBe(404)
    // Complete normally so the flow's server closes.
    await realFetch(`${redirectFromLogs()}?code=ok&state=${encodeURIComponent(stateFromLogs())}`)
    await expect(flow).resolves.toBeTruthy()
  })
})
