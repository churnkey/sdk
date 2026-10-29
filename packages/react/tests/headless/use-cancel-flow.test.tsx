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
    vi.restoreAllMocks()
    console.error = originalError
  })

  it('holds the token-mode flow until the built-in locale pack is applied', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => goodResponse } as Response)
    const { result } = renderHook(() => useCancelFlow({ session: TOKEN, i18n: { locale: 'es-MX' } }))
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.messages.confirm.cta).toBe('Cancelar suscripción')
    expect(result.current.messages.common.back).toBe('Atrás')
    expect(result.current.locale).toBe('es-MX')
  })

  // The server says which language it translated the flow into. Without an
  // explicit locale the chrome follows that, so a visitor never gets Spanish
  // buttons around copy the org only has in English.
  it('without an explicit locale, follows the language the server translated the flow into', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES')
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...goodResponse, language: 'es-ES' }) } as Response)
    const { result } = renderHook(() => useCancelFlow({ session: TOKEN }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ language: 'es-ES' })
    expect(result.current.messages.confirm.cta).toBe('Cancelar suscripción')
    expect(result.current.locale).toBe('es-ES')
  })

  it('without an explicit locale, stays English when the server kept the source copy', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES')
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ...goodResponse, translations: { es: { common: { back: 'Org atrás' } } } }),
    } as Response)
    const { result } = renderHook(() => useCancelFlow({ session: TOKEN }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.messages.confirm.cta).toBe('Cancel subscription')
    expect(result.current.messages.common.back).toBe('Back')
    expect(result.current.locale).toBe('en')
  })

  it('an explicit locale is the chrome language even when the content is not translated', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => goodResponse } as Response)
    const { result } = renderHook(() => useCancelFlow({ session: TOKEN, i18n: { locale: 'es' } }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.messages.confirm.cta).toBe('Cancelar suscripción')
  })

  it('reads i18n once at mount: a new locale neither refetches nor restarts the flow', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => goodResponse } as Response)
    const { result, rerender } = renderHook(({ locale }) => useCancelFlow({ session: TOKEN, i18n: { locale } }), {
      initialProps: { locale: 'es' },
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    rerender({ locale: 'tr' })
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.messages.confirm.cta).toBe('Cancelar suscripción')
  })

  it('in local mode waits for the pack, then renders in that language', async () => {
    const { result } = renderHook(() =>
      useCancelFlow({ steps: [{ type: 'survey', reasons: [{ id: 'r1', label: 'Test' }] }], i18n: { locale: 'tr' } }),
    )
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.messages.confirm.cta).toBe('Aboneliği iptal et')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('in local mode ignores the browser language: the steps are in whatever language they were written', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES')
    const { result } = renderHook(() =>
      useCancelFlow({ steps: [{ type: 'survey', reasons: [{ id: 'r1', label: 'Test' }] }] }),
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.messages.confirm.cta).toBe('Cancel subscription')
    expect(result.current.locale).toBe('en')
  })

  it('a remount starts in the loaded language, with no spinner', async () => {
    const steps = [{ type: 'survey' as const, reasons: [{ id: 'r1', label: 'Test' }] }]
    const first = renderHook(() => useCancelFlow({ steps, i18n: { locale: 'de-AT' } }))
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    first.unmount()
    const { result } = renderHook(() => useCancelFlow({ steps, i18n: { locale: 'de-AT' } }))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.messages.confirm.cta).toBe('Abo kündigen')
  })

  it('in local mode an English locale has nothing to load', () => {
    const { result } = renderHook(() =>
      useCancelFlow({ steps: [{ type: 'survey', reasons: [{ id: 'r1', label: 'Test' }] }], i18n: { locale: 'en' } }),
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.messages.confirm.cta).toBe('Cancel subscription')
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
      renderHook(() => useCancelFlow({ session: TOKEN, customerAttributes: { videosCreated: 28 } }))
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/cancel-flow/config')
    expect(JSON.parse(init.body)).toMatchObject({ customAttributes: { videosCreated: 28 } })
  })

  // The server reads flow copy from the blueprint's Automatic Translations
  // for this language. Without it every connected-mode flow rendered the
  // source language regardless of the customer's locale.
  it('sends i18n.locale as the config request language', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => goodResponse } as Response)

    await act(async () => {
      renderHook(() => useCancelFlow({ session: TOKEN, i18n: { locale: 'es-MX' } }))
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ language: 'es-MX' })
  })

  it('falls back to the browser language when i18n.locale is unset', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => goodResponse } as Response)
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('tr-TR')

    await act(async () => {
      renderHook(() => useCancelFlow({ session: TOKEN }))
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ language: 'tr-TR' })
  })

  it('asks for pairs of offers only when the UI says it shows them', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => goodResponse } as Response)

    await act(async () => {
      renderHook(() => useCancelFlow({ session: TOKEN }))
      renderHook(() => useCancelFlow({ session: TOKEN, stackedOffers: true }))
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls.map(([, init]) => init.headers['x-ck-capabilities'])).toEqual([
      undefined,
      'stacked-offers',
    ])
  })

  // Every callback must route through the ref so the latest render's closure
  // runs. handleRebate/onRebate were missing from the dispatch table, so the
  // machine held the first render's closure forever — or nothing at all if
  // the consumer attached the callback after mount.
  it('routes rebate callbacks through the ref so the latest closure runs', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const steps = [
      { type: 'offer' as const, offer: { type: 'rebate' as const, amountMinor: 500, currency: 'usd' } },
      { type: 'confirm' as const },
    ]
    const { result, rerender } = renderHook((props: { onRebate: typeof first }) => useCancelFlow({ steps, ...props }), {
      initialProps: { onRebate: first },
    })
    rerender({ onRebate: second })

    await act(async () => {
      await result.current.accept()
    })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ type: 'rebate', amountMinor: 500 }), null)
  })
})
