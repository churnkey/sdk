export function formatPrice(amount: number, currency: string = 'USD', locale?: string): string {
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

export function calculateDiscountedPrice(originalPrice: number, percentOff: number): number {
  return originalPrice * (1 - percentOff / 100)
}
