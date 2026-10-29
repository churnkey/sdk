import { describe, expect, it } from 'vitest'
import { discountPhrase, formatPeriodEnd, formatPrice, formatShortDate } from '../../src/core/format'
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
      common: { month: 'Monat', months: 'Monate' },
      offer: { discount: { percentOff: '{percent} % Rabatt', forMonths: '{months} {unit} lang {discount}' } },
    })
    expect(discountPhrase({ percentOff: 25, durationInMonths: 3 }, de, 'de')).toBe('3 Monate lang 25 % Rabatt')
    expect(discountPhrase({ amountOff: 500, currency: 'EUR', durationInMonths: 1 }, de, 'de')).toBe(
      '1 Monat lang 5\u00a0€ off',
    )
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
