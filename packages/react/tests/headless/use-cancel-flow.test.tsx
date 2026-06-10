import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCancelFlow } from '../../src/headless/use-cancel-flow'

// Mint a token in the format decodeSessionToken accepts. The signature is
// not verified client-side; the hook just decodes the payload to pull out
// appId/customerId/authHash for the fetch headers.
function createToken(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload)
  const base64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `ck_${base64}`
}

const TOKEN = createToken({ a: 'app_1', c: 'cus_1', h: 'h_1', m: 'live', t: 0 })

const goodResponse = {
  blueprintId: 'bp_1',
  steps: [{ type: 'survey', guid: 's1', reasons: [{ id: 'r1', label: 'Test' }] }],
  customer: { id: 'cus_1' },
  subscriptions: [],
  settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
}

describe('useCancelFlow', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  // Vitest's React 18 strict mode emits act() warnings whenever a fetch
  // promise resolves outside a test-controlled tick. The hook deliberately
  // fires its effect on mount and we can't get a handle on the resolution
  // promise from the public API. The behavior is right (assertions below
  // pass via waitFor); only the noise needs filtering.
  let originalError: typeof console.error

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    originalError = console.error
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) return
      originalError(...args)
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    console.error = originalError
  })

  it('exposes retry as a function on the returned object', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => goodResponse } as Response)
    const { result } = renderHook(() => useCancelFlow({ session: TOKEN }))
    expect(typeof result.current.retry).toBe('function')
  })

  it('retry re-fetches the config and clears loadError on success', async () => {
    // First fetch fails, second succeeds. Verifies the loadError → retry →
    // recovered flow that the docs promise.
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, json: async () => goodResponse } as Response)

    let hook: ReturnType<typeof renderHook<ReturnType<typeof useCancelFlow>, void>>
    await act(async () => {
      hook = renderHook(() => useCancelFlow({ session: TOKEN }))
    })

    await waitFor(() => {
      expect(hook!.result.current.loadError).toBeInstanceOf(Error)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      hook!.result.current.retry()
    })

    await waitFor(() => {
      expect(hook!.result.current.loadError).toBeNull()
      expect(hook!.result.current.isLoading).toBe(false)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends customerAttributes in the config request body', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => goodResponse } as Response)

    await act(async () => {
      renderHook(() => useCancelFlow({ session: TOKEN, customerAttributes: { isRebateEligible: true } }))
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/cancel-flow/config')
    expect(JSON.parse(init.body)).toEqual({ customAttributes: { isRebateEligible: true } })
  })
})
