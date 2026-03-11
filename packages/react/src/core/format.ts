/**
 * Format a price with currency symbol.
 * Uses Intl.NumberFormat when available, falls back to basic formatting.
 */
export function formatPrice(
  amount: number,
  currency: string = 'USD',
  locale?: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/**
 * Calculate discounted price.
 */
export function calculateDiscountedPrice(
  originalPrice: number,
  percentOff: number,
): number {
  return originalPrice * (1 - percentOff / 100)
}

/**
 * Join CSS class names, filtering out falsy values.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
