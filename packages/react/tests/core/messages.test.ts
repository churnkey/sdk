import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildMessages,
  defaultMessages,
  formatMessage,
  mergeMessages,
  resolveLocale,
  selectTiming,
} from '../../src/core/messages'

describe('mergeMessages', () => {
  it('returns the base untouched with no patch', () => {
    expect(mergeMessages(defaultMessages, undefined)).toBe(defaultMessages)
  })

  it('overrides one key and keeps the rest', () => {
    const merged = mergeMessages(defaultMessages, { common: { continue: 'Keep going' } })
    expect(merged.common.continue).toBe('Keep going')
    expect(merged.common.back).toBe('Back')
    expect(merged.survey.title).toBe(defaultMessages.survey.title)
  })

  it('does not mutate the base catalog', () => {
    mergeMessages(defaultMessages, { common: { continue: 'Keep going' } })
    expect(defaultMessages.common.continue).toBe('Continue')
  })

  it('drops empty-string overrides so a blank field never clobbers a real string', () => {
    const merged = mergeMessages(defaultMessages, { common: { continue: '' } })
    expect(merged.common.continue).toBe('Continue')
  })

  it('replaces a timing-aware value with a plain string', () => {
    const merged = mergeMessages(defaultMessages, { confirm: { cta: 'End membership' } })
    expect(merged.confirm.cta).toBe('End membership')
  })

  it('expands a string base into both variants when patched with a full pair', () => {
    const merged = mergeMessages(defaultMessages, {
      confirm: { cta: { immediate: 'Cancel', atPeriodEnd: 'Turn off auto-renew' } },
    })
    expect(merged.confirm.cta).toEqual({ immediate: 'Cancel', atPeriodEnd: 'Turn off auto-renew' })
  })

  it('keeps the base value for the missing variant of a partial pair', () => {
    const merged = mergeMessages(defaultMessages, {
      confirm: { cta: { atPeriodEnd: 'Turn off auto-renew' } },
    })
    expect(merged.confirm.cta).toEqual({ immediate: 'Cancel subscription', atPeriodEnd: 'Turn off auto-renew' })
  })

  it('merges a variant pair over a variant-pair base', () => {
    const merged = mergeMessages(defaultMessages, {
      confirm: { periodEndNotice: { atPeriodEnd: 'Access until {periodEnd}.' } },
    })
    expect(merged.confirm.periodEndNotice).toEqual({ immediate: '', atPeriodEnd: 'Access until {periodEnd}.' })
  })
})

describe('selectTiming', () => {
  const pair = { immediate: 'Cancel', atPeriodEnd: 'Turn off auto-renew' }

  it('passes plain strings through for either timing', () => {
    expect(selectTiming('Cancel subscription', true)).toBe('Cancel subscription')
    expect(selectTiming('Cancel subscription', false)).toBe('Cancel subscription')
  })

  it('picks the variant for the resolved timing', () => {
    expect(selectTiming(pair, false)).toBe('Cancel')
    expect(selectTiming(pair, true)).toBe('Turn off auto-renew')
  })

  it('treats unknown timing as period-end, matching the cancel action default', () => {
    expect(selectTiming(pair, null)).toBe('Turn off auto-renew')
  })
})

describe('formatMessage', () => {
  it('replaces tokens', () => {
    expect(formatMessage('Access until {periodEnd}.', { periodEnd: 'June 14' })).toBe('Access until June 14.')
    expect(formatMessage('At least {minLength} characters', { minLength: 20 })).toBe('At least 20 characters')
  })

  it('leaves unknown tokens in place', () => {
    expect(formatMessage('Hello {name}', {})).toBe('Hello {name}')
  })
})

describe('resolveLocale / buildMessages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prefers the explicit locale over the browser', () => {
    expect(resolveLocale('de')).toBe('de')
  })

  it('falls back to navigator.language', () => {
    vi.stubGlobal('navigator', { language: 'fr-CA' })
    expect(resolveLocale()).toBe('fr-CA')
  })

  it('resolves defaults with no config', () => {
    expect(buildMessages()).toEqual(defaultMessages)
  })

  it('applies the locale fallback chain: en, base language, exact tag', () => {
    const resolved = buildMessages({
      locale: 'pt-BR',
      messages: {
        en: { common: { continue: 'EN override', back: 'EN back' } },
        pt: { common: { continue: 'PT continue' } },
        'pt-br': { common: { done: 'PT-BR done' } },
      },
    })
    // Exact and base-language patches win over 'en'; untouched keys show the
    // 'en' override through the partial regional catalog.
    expect(resolved.common.continue).toBe('PT continue')
    expect(resolved.common.done).toBe('PT-BR done')
    expect(resolved.common.back).toBe('EN back')
    expect(resolved.common.close).toBe('Close')
  })

  it('matches locale keys case-insensitively', () => {
    const resolved = buildMessages({
      locale: 'pt-br',
      messages: { 'pt-BR': { common: { continue: 'PT-BR' } } },
    })
    expect(resolved.common.continue).toBe('PT-BR')
  })

  it('layers org messages below the developer messages', () => {
    const resolved = buildMessages(
      { locale: 'en', messages: { en: { common: { continue: 'Developer' } } } },
      { en: { common: { continue: 'Org', back: 'Org back' } } },
    )
    expect(resolved.common.continue).toBe('Developer')
    expect(resolved.common.back).toBe('Org back')
  })

  it('runs the org layer through the same locale fallback chain', () => {
    const resolved = buildMessages(
      { locale: 'de-AT' },
      {
        en: { common: { continue: 'Org EN continue', done: 'Org EN done' } },
        de: { common: { continue: 'Org DE continue' } },
      },
    )
    expect(resolved.common.continue).toBe('Org DE continue')
    expect(resolved.common.done).toBe('Org EN done')
    expect(resolved.common.back).toBe('Back')
  })

  it('org timing-aware overrides survive under unrelated developer overrides', () => {
    const resolved = buildMessages(
      { locale: 'en', messages: { en: { common: { continue: 'Developer' } } } },
      { en: { confirm: { cta: { immediate: 'Cancel', atPeriodEnd: 'Turn off auto-renew' } } } },
    )
    expect(resolved.confirm.cta).toEqual({ immediate: 'Cancel', atPeriodEnd: 'Turn off auto-renew' })
    expect(resolved.common.continue).toBe('Developer')
  })
})

// The org layer arrives unvalidated over the wire, so the merge must treat
// the catalog as the schema: wrong-shaped patches are dropped, never trusted.
describe('malformed patches (base-driven dispatch)', () => {
  it('ignores a string landing on a category node', () => {
    const merged = mergeMessages(defaultMessages, { common: 'hello' } as never)
    expect(merged.common.continue).toBe('Continue')
    expect(typeof merged.common).toBe('object')
  })

  it('ignores a timing pair landing on a plain leaf', () => {
    const merged = mergeMessages(defaultMessages, {
      common: { continue: { atPeriodEnd: 'x' } },
    } as never)
    expect(merged.common.continue).toBe('Continue')
  })

  it('ignores a timing pair landing on a category node', () => {
    const merged = mergeMessages(defaultMessages, {
      confirm: { immediate: 'x', atPeriodEnd: 'y' },
    } as never)
    expect(merged.confirm.title).toBe('Confirm cancellation')
    expect('immediate' in merged.confirm).toBe(false)
  })

  it('drops keys the catalog does not declare', () => {
    const merged = mergeMessages(defaultMessages, { common: { madeUp: 'x' } } as never)
    expect('madeUp' in merged.common).toBe(false)
  })

  it('ignores non-string variant values in a pair', () => {
    const merged = mergeMessages(defaultMessages, {
      confirm: { cta: { atPeriodEnd: 42 } },
    } as never)
    expect(merged.confirm.cta).toBe('Cancel subscription')
  })

  it('ignores arrays and numbers on leaves', () => {
    const merged = mergeMessages(defaultMessages, {
      common: { continue: 42, back: ['x'] },
    } as never)
    expect(merged.common.continue).toBe('Continue')
    expect(merged.common.back).toBe('Back')
  })
})
