import { describe, expect, it, vi } from 'vitest'
import { discountPhrase, formatDuration, formatPeriodEnd, formatPrice, formatShortDate } from '../../src/core/format'
import { defaultMessages, mergeMessages } from '../../src/core/messages'

describe('discountPhrase', () => {
  it('says the amount, then how long it lasts', () => {
    expect(discountPhrase({ percentOff: 25, durationInMonths: 3 }, defaultMessages)).toBe('25% off for 3 months')
    expect(discountPhrase({ percentOff: 25, durationInMonths: 1 }, defaultMessages)).toBe('25% off for 1 month')
    expect(discountPhrase({ amountOff: 500, currency: 'USD', duration: 'once' }, defaultMessages)).toBe(
      '$5 off your next renewal',
    )
    expect(discountPhrase({ percentOff: 20, duration: 'forever' }, defaultMessages)).toBe('20% off for life')
    expect(discountPhrase({ percentOff: 20 }, defaultMessages)).toBe('20% off')
    expect(discountPhrase({ durationInMonths: 2 }, defaultMessages)).toBe('A discount for 2 months')
  })

  it('takes its words and its number formats from the catalog and the locale', () => {
    const de = mergeMessages(defaultMessages, {
      offer: { discount: { percentOff: '{percent} % Rabatt', forMonths: '{duration} lang {discount}' } },
    })
    expect(discountPhrase({ percentOff: 25, durationInMonths: 3 }, de, 'de')).toBe('3 Monate lang 25 % Rabatt')
    expect(discountPhrase({ amountOff: 500, currency: 'EUR', durationInMonths: 1 }, de, 'de')).toBe(
      '1 Monat lang 5\u00a0€ off',
    )
  })

  it('pluralize the duration by the language, not a singular/plural pair', () => {
    const pl = mergeMessages(defaultMessages, { offer: { discount: { forMonths: '{discount} przez {duration}' } } })
    expect(discountPhrase({ percentOff: 25, durationInMonths: 3 }, pl, 'pl')).toBe('25% off przez 3 miesiące')
    expect(discountPhrase({ percentOff: 25, durationInMonths: 5 }, pl, 'pl')).toBe('25% off przez 5 miesięcy')
    expect(formatDuration(1, 'day', defaultMessages, 'en')).toBe('1 day')
  })

  it('fall back to the catalog words where Intl has no unit names or no unit style', () => {
    const words = mergeMessages(defaultMessages, { common: { month: 'mahina', months: 'mahine' } })
    // ICU has no unit names for Bhojpuri and prints "३ m".
    expect(formatDuration(3, 'month', words, 'bho')).toBe('3 mahine')
    expect(formatDuration(1, 'month', words, 'en_US')).toBe('1 mahina')
    // Chinese "天" is one letter but real data, not the root fallback.
    expect(formatDuration(14, 'day', defaultMessages, 'zh-CN')).toBe('14天')
    const RealNumberFormat = Intl.NumberFormat
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(((tag: string, opts?: Intl.NumberFormatOptions) => {
      if (opts?.style === 'unit') throw new RangeError('Invalid style')
      return new RealNumberFormat(tag, opts)
    }) as typeof Intl.NumberFormat)
    expect(formatDuration(14, 'day', defaultMessages, 'en')).toBe('14 days')
    vi.restoreAllMocks()
  })
})

describe('dates and prices follow the locale', () => {
  const date = new Date(2026, 2, 1)

  it('format in the given language', () => {
    expect(formatShortDate(date, 'en')).toBe('Mar 1, 2026')
    expect(formatShortDate(date, 'de')).toBe('1. März 2026')
    expect(formatPrice(29, 'USD', 'en')).toBe('$29')
    // Intl puts a no-break space before a trailing symbol.
    expect(formatPrice(29, 'USD', 'de')).toBe('29\u00a0$')
  })

  it('drop a zero fraction without touching digit groups', () => {
    // Lakh grouping has a ",00" group mid-number; only the fraction goes.
    expect(formatPrice(100000, 'INR', 'hi')).toBe('₹1,00,000')
    expect(formatPrice(1000500, 'USD', 'en-IN')).toBe('$10,00,500')
    expect(formatPrice(29.5, 'USD', 'en')).toBe('$29.50')
    expect(formatPrice(1234.5, 'EUR', 'de')).toBe('1.234,50\u00a0€')
  })

  it('fall back to the runtime default for a malformed tag instead of throwing', () => {
    expect(formatShortDate(date, 'en_US')).toBe(formatShortDate(date))
    expect(formatPrice(29, 'USD', 'en_US')).toBe(formatPrice(29, 'USD'))
    expect(
      formatPeriodEnd(
        [
          {
            id: 's',
            start: '2026-01-01',
            status: { name: 'active', currentPeriod: { start: date, end: date } },
            items: [],
          },
        ],
        'en_US',
      ),
    ).toBe(
      formatPeriodEnd([
        {
          id: 's',
          start: '2026-01-01',
          status: { name: 'active', currentPeriod: { start: date, end: date } },
          items: [],
        },
      ]),
    )
  })
})
