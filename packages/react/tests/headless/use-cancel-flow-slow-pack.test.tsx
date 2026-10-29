import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCancelFlow } from '../../src/headless/use-cancel-flow'

// A pack that never arrives. The real loader gives up after five seconds;
// here the question is whether the flow waits on it at all.
vi.mock('../../src/locales', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/locales')>()),
  loadLocaleMessages: () => new Promise(() => {}),
}))

const TOKEN = `ck_${btoa(JSON.stringify({ a: 'app_1', c: 'cus_1', h: 'h_1', m: 'live', t: 0 }))}`
const response = {
  blueprintId: 'bp_1',
  steps: [{ type: 'survey', guid: 's1', reasons: [{ id: 'r1', label: 'Test' }] }],
  customer: { id: 'cus_1' },
  subscriptions: [],
  settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false },
}

describe('useCancelFlow, when the locale pack is slow', () => {
  beforeEach(() => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not hold source copy for a pack it will not use', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }))
    const { result } = renderHook(() => useCancelFlow({ session: TOKEN }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.messages.confirm.cta).toBe('Cancel subscription')
  })

  it('waits for the pack when the content came back translated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...response, language: 'es-ES' }) }),
    )
    const { result } = renderHook(() => useCancelFlow({ session: TOKEN }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(result.current.isLoading).toBe(true)
  })
})
