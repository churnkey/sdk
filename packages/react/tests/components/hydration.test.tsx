import { act } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CancelFlow } from '../../src/components/cancel-flow'
import type { CancelFlowProps } from '../../src/core/types'

// The server has no browser language; the client does. Both first renders
// have to come from props alone or hydration fails.
const props: CancelFlowProps = {
  steps: [{ type: 'survey', reasons: [{ id: 'a', label: 'Too expensive' }] }],
  onCancel: async () => {},
}

describe('server render then hydrate in a Spanish browser', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it.each([
    ['without a locale', undefined],
    ['with an explicit locale', 'es'],
  ])('hydrates %s with no mismatch', async (_, locale) => {
    const flow = <CancelFlow {...props} i18n={locale ? { locale } : undefined} />
    const html = renderToString(flow)

    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recoverable: unknown[] = []
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    await act(async () => {
      hydrateRoot(container, flow, { onRecoverableError: (err) => recoverable.push(err) })
    })

    expect(recoverable).toEqual([])
    expect(errors).not.toHaveBeenCalled()
  })
})
