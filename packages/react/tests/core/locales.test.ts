import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pauseResumeParts } from '../../src/components/steps/offer/offer-controls'
import {
  buildMessages,
  catalogLocale,
  defaultMessages,
  expandPluralPaths,
  formatMessage,
  formatPlural,
  type MessagesPatch,
  PLURAL_PATHS,
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

describe('catalogLocale', () => {
  it('is the requested language only when there is text in it', () => {
    const sv = { common: { back: 'Tillbaka' } }
    expect(catalogLocale('sv', undefined, undefined, undefined)).toBe('en')
    expect(catalogLocale('sv-SE', undefined, { sv }, undefined)).toBe('sv-SE')
    expect(catalogLocale('sv', { SV: sv }, undefined, undefined)).toBe('sv')
    expect(catalogLocale('es', undefined, undefined, { common: { back: 'Atrás' } })).toBe('es')
    // A failed or slow pack: English text, English dates.
    expect(catalogLocale('es', undefined, undefined, undefined)).toBe('en')
    expect(catalogLocale('en-GB', undefined, undefined, undefined)).toBe('en-GB')
  })
})

describe('plural forms', () => {
  const plPack: MessagesPatch = {
    offer: {
      discount: {
        forMonths: {
          one: '{discount} przez {count} miesiąc',
          few: '{discount} przez {count} miesiące',
          many: '{discount} przez {count} miesięcy',
          other: '{discount} przez {count} miesiąca',
        },
      },
    },
  }
  const months = (messages: ReturnType<typeof buildMessages>, count: number, locale: string) =>
    formatPlural(messages.offer.discount.forMonths, count, locale, { discount: 'X' })

  it('are picked with the rules of the language they are in, not the requested one', () => {
    // Croatian overrides elsewhere, English forms here: Croatian rules would say "21 month".
    const hr = buildMessages({ locale: 'hr' }, { hr: { common: { back: 'Natrag' } } })
    expect(months(hr, 21, 'hr')).toBe('X for 21 months')
    // The Japanese pack timed out but an org entry exists: still "1 month".
    const ja = buildMessages({ locale: 'ja' }, { ja: { common: { back: '戻る' } } })
    expect(months(ja, 1, 'ja')).toBe('X for 1 month')
    const pl = buildMessages({ locale: 'pl' }, undefined, plPack)
    expect([1, 2, 5, 22].map((n) => months(pl, n, 'pl'))).toEqual([
      'X przez 1 miesiąc',
      'X przez 2 miesiące',
      'X przez 5 miesięcy',
      'X przez 22 miesiące',
    ])
  })

  it('an override with `other` replaces every form; one without edits only those it names', () => {
    const whole = buildMessages(
      { locale: 'pl' },
      { pl: { offer: { discount: { forMonths: { one: 'jeden (org)', other: '{count} (org)' } } } } },
      plPack,
    )
    expect([1, 2, 5].map((n) => months(whole, n, 'pl'))).toEqual(['jeden (org)', '2 (org)', '5 (org)'])
    const edit = buildMessages(
      { locale: 'pl', messages: { pl: { offer: { discount: { forMonths: { few: '{count} (dev)' } } } } } },
      undefined,
      plPack,
    )
    expect([2, 5].map((n) => months(edit, n, 'pl'))).toEqual(['2 (dev)', 'X przez 5 miesięcy'])
  })

  it('an edit in another language than the forms under it takes its own rules', () => {
    // The Polish pack failed: English forms, then a Polish edit without `other`.
    const pl = buildMessages(
      { locale: 'pl' },
      {
        pl: {
          offer: { discount: { forMonths: { one: '1 miesiąc', few: '{count} miesiące', many: '{count} miesięcy' } } },
        },
      },
    )
    expect([1, 2, 5].map((n) => months(pl, n, 'pl'))).toEqual(['1 miesiąc', '2 miesiące', '5 miesięcy'])
  })
})

describe('pauseResumeParts', () => {
  it('splits around the date only where no word is glued to it', () => {
    expect(pauseResumeParts("We'll see you back on {date}")).toEqual(["We'll see you back on", ''])
    expect(pauseResumeParts('Wir sehen uns am {date} wieder.')).toEqual(['Wir sehen uns am', 'wieder.'])
    expect(pauseResumeParts('{date}。')).toEqual(['', '。'])
    expect(pauseResumeParts('{date}에 다시 만나요')).toBeNull()
    expect(pauseResumeParts('በ{date} እንገናኛለን')).toBeNull()
  })
})

describe('built-in packs', () => {
  const english = flatten(defaultMessages)

  it('en.json is the English the packs were translated from; regenerate when it drifts', () => {
    expect(flatten(source)).toEqual(english)
  })

  it('no pack still owes a translation from a failed or --only generator run', () => {
    expect(existsSync(resolve(__dirname, '../../../../scripts/locales-pending.json'))).toBe(false)
  })

  it('every pack carries every translatable string, with its placeholders', async () => {
    for (const [tag, load] of Object.entries(packs)) {
      const pack = flatten((await load()).default)
      // Plural messages carry the forms this language has, not English's two.
      const expected = expandPluralPaths(english, tag)
      expect(Object.keys(pack).sort(), tag).toEqual(Object.keys(expected).sort())
      for (const [path, value] of Object.entries(pack)) {
        // The zero, one and two forms may leave the number out ("شهرين" is "two months").
        const numberOptional = /\.(zero|one|two)$/.test(path) && PLURAL_PATHS.has(path.replace(/\.\w+$/, ''))
        const strip = (names: string[]) => names.filter((name) => !(numberOptional && name === 'count'))
        expect(strip(placeholders(value)), `${tag} ${path}`).toEqual(strip(placeholders(expected[path])))
      }
    }
  })
})
