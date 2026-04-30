// Currencies whose smallest unit equals one major unit (no fractional part).
// Stripe and most billing providers store these without an implicit /100.
const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

// Middle-Eastern currencies that use three fractional digits (1000 divisor).
// Without this bucket, JOD/KWD amounts would be off by 10x in display.
const THREE_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

export function isZeroDecimalCurrency(currency: string): boolean {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
}

export function isThreeDecimalCurrency(currency: string): boolean {
  return THREE_DECIMAL_CURRENCIES.has(currency.toUpperCase())
}

/**
 * Smallest-unit divisor for a currency. 1 for zero-decimal (JPY), 1000 for
 * three-decimal (KWD), 100 for everything else. Used to convert provider
 * amounts (which are always in the smallest unit) into the major unit for
 * display.
 */
export function getCurrencyDivisor(currency = 'USD'): number {
  if (isZeroDecimalCurrency(currency)) return 1
  if (isThreeDecimalCurrency(currency)) return 1000
  return 100
}

/**
 * Converts a Direct.Price.amount.value (smallest currency unit) into the
 * major unit used for display.
 */
export function convertFromMinorUnits(value: number, currency = 'USD'): number {
  return value / getCurrencyDivisor(currency)
}

/**
 * Format an amount already in the major unit. Uses `narrowSymbol` so output
 * reads "$29" rather than "US$29", and trims trailing zero fractions so
 * whole amounts render compactly.
 */
export function formatPrice(amount: number, currency = 'USD', locale?: string): string {
  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).format(amount)
    return formatted.replace(/[.,]00$/, '')
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/** Convenience: format a Direct-shape minor-unit amount in one call. */
export function formatPriceFromMinor(value: number, currency = 'USD', locale?: string): string {
  return formatPrice(convertFromMinorUnits(value, currency), currency, locale)
}

export function calculateDiscountedPrice(originalPrice: number, percentOff: number): number {
  return originalPrice * (1 - percentOff / 100)
}

// ─── Dates ────────────────────────────────────────────────────────────────

/** "Apr 30, 2026" — used for resume dates and other full-date contexts. */
export function formatShortDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Apr 30" — used when the year is implied by context. */
export function formatMonthDay(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

// ─── Discount phrasing ─────────────────────────────────────────────────────

/**
 * Renders the discount as a single human-readable sentence:
 *   "25% off for 3 months" / "$5 off your next renewal" / "20% off for life"
 *
 * Mirrors the embed's couponToString helper so SDK and embed use the same
 * phrasing for the same offer shape.
 */
export function discountPhrase(opts: {
  percentOff?: number
  /** Smallest currency unit (cents for USD). */
  amountOff?: number
  currency?: string
  duration?: 'once' | 'repeating' | 'forever'
  durationInMonths?: number
}): string {
  const { percentOff, amountOff, currency, duration, durationInMonths } = opts
  const amount =
    percentOff != null
      ? `${percentOff}% off`
      : amountOff != null
        ? `${formatPriceFromMinor(amountOff, currency)} off`
        : 'discount'
  const tail =
    duration === 'once'
      ? 'your next renewal'
      : duration === 'forever'
        ? 'for life'
        : durationInMonths
          ? `for ${durationInMonths} ${durationInMonths === 1 ? 'month' : 'months'}`
          : ''
  return tail ? `${amount} ${tail}` : amount
}
