import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildMessages,
  defaultMessages,
  formatMessage,
  type MessagesPatch,
  selectTiming,
} from '../../src/core/messages'
import { createLocaleLoader, hasLocalePack, loadLocaleMessages, packs, peekLocaleMessages } from '../../src/locales'
import source from '../../src/locales/en.json'

const esPack = { default: { common: { back: 'Atrás' } } }

describe('loadLocaleMessages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('loads the pack for an exact tag', async () => {
    const es = await loadLocaleMessages('es')
    expect(es?.confirm?.cta).toBe('Cancelar suscripción')
    const ptBr = await loadLocaleMessages('pt-BR')
    expect(ptBr?.confirm?.cta).toBe('Cancelar assinatura')
  })

  it('falls back from a regional tag to the base language, and across regions', async () => {
    expect(await loadLocaleMessages('es-MX')).toEqual(await loadLocaleMessages('es'))
    // pt-PT has no pack of its own; the embed reads pt-BR for it too.
    expect(await loadLocaleMessages('pt-PT')).toEqual(await loadLocaleMessages('pt-BR'))
  })

  it('loads nothing for English or an unknown language', async () => {
    expect(hasLocalePack('en')).toBe(false)
    expect(hasLocalePack('en-GB')).toBe(false)
    expect(hasLocalePack('xx')).toBe(false)
    expect(await loadLocaleMessages('en-US')).toBeUndefined()
    expect(await loadLocaleMessages('xx')).toBeUndefined()
    expect(hasLocalePack('ES')).toBe(true)
  })

  it('remembers a loaded pack so a later mount can start in that language', async () => {
    expect(peekLocaleMessages('tr')).toBeUndefined()
    const tr = await loadLocaleMessages('tr-TR')
    expect(peekLocaleMessages('tr')).toBe(tr)
    expect(peekLocaleMessages('en')).toBeUndefined()
  })

  it('shares one import between concurrent loads', async () => {
    const importer = vi.fn(async () => esPack)
    const loader = createLocaleLoader({ es: importer })
    const [a, b] = await Promise.all([loader.load('es'), loader.load('es-AR')])
    expect(a).toBe(esPack.default)
    expect(b).toBe(esPack.default)
    expect(importer).toHaveBeenCalledTimes(1)
    await loader.load('es')
    expect(importer).toHaveBeenCalledTimes(1)
  })

  it('falls back to English when the chunk fails to load, and tries again next time', async () => {
    const importer = vi.fn().mockRejectedValueOnce(new Error('blocked')).mockResolvedValueOnce(esPack)
    const loader = createLocaleLoader({ es: importer })
    expect(await loader.load('es')).toBeUndefined()
    expect(loader.peek('es')).toBeUndefined()
    expect(await loader.load('es')).toBe(esPack.default)
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it('gives up on a chunk that does not arrive in time, and keeps it once it does', async () => {
    vi.useFakeTimers()
    let arrive: (pack: typeof esPack) => void = () => {}
    const loader = createLocaleLoader({ es: () => new Promise((resolve) => (arrive = resolve)) }, 1000)
    const load = loader.load('es')
    await vi.advanceTimersByTimeAsync(1000)
    expect(await load).toBeUndefined()
    arrive(esPack)
    await vi.advanceTimersByTimeAsync(0)
    expect(loader.peek('es')).toBe(esPack.default)
  })

  it('sits under org translations, which sit under developer messages', async () => {
    const pack = await loadLocaleMessages('es')
    const resolved = buildMessages(
      { locale: 'es', messages: { es: { common: { continue: 'Developer' } } } },
      { es: { common: { continue: 'Org', back: 'Org back' } } },
      pack,
    )
    expect(resolved.common.continue).toBe('Developer')
    expect(resolved.common.back).toBe('Org back')
    expect(resolved.common.close).toBe('Cerrar')
    expect(resolved.survey.title).toBe('¿Por qué cancelas?')
  })

  it('keeps the catalog shape: a one-sided period-end notice keeps the empty immediate variant', async () => {
    const pack = await loadLocaleMessages('es')
    expect((pack as MessagesPatch).confirm?.periodEndNotice).not.toHaveProperty('immediate')
    const resolved = buildMessages({ locale: 'es' }, undefined, pack)
    expect(selectTiming(resolved.confirm.periodEndNotice, false)).toBe('')
    expect(selectTiming(resolved.confirm.periodEndNotice, true)).toContain('{periodEnd}')
    expect(resolved.confirm.cta).toBe('Cancelar suscripción')
  })

  it('keeps placeholders through formatMessage in a non-Latin script', async () => {
    const ja = await loadLocaleMessages('ja')
    const resolved = buildMessages({ locale: 'ja' }, undefined, ja)
    const notice = selectTiming(resolved.confirm.periodEndNotice, true)
    expect(notice).toContain('{periodEnd}')
    expect(formatMessage(notice, { periodEnd: '2026年11月1日' })).toBe(notice.replace('{periodEnd}', '2026年11月1日'))
    expect(resolved.feedback.placeholderWithMin).toContain('{minLength}')
  })

  it('without a pack the catalog is unchanged', () => {
    expect(buildMessages({ locale: 'es' }, undefined, undefined)).toEqual(defaultMessages)
  })
})

// Flattened `a.b.c` → string, skipping the empty-by-design strings, which is
// what the generator writes and what every pack must cover.
function flatten(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') {
    if (node !== '') out[prefix] = node
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) flatten(value, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('built-in packs', () => {
  const english = flatten(defaultMessages)

  it('en.json is the English the packs were translated from; regenerate when it drifts', () => {
    expect(flatten(source)).toEqual(english)
  })

  it('every pack carries every translatable string, with its placeholders', async () => {
    for (const [tag, load] of Object.entries(packs)) {
      const pack = flatten((await load()).default)
      expect(Object.keys(pack).sort(), tag).toEqual(Object.keys(english).sort())
      for (const [path, value] of Object.entries(pack)) {
        expect(placeholders(value), `${tag} ${path}`).toEqual(placeholders(english[path]))
      }
    }
  })
})
