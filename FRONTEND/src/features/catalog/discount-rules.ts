/** Parses a percent field: '' -> null, invalid -> NaN. */
export function parsePercent(value: string): number | null {
  const text = value.trim().replace(',', '.')
  if (text === '') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : Number.NaN
}

/** Error key for a percent field (0 to 100, at most 2 decimals), or undefined when valid. */
export function percentError(value: number | null): string | undefined {
  if (value === null) return undefined
  if (Number.isNaN(value) || value < 0 || value > 100) return 'orders.form.discountRange'
  if (Math.round(value * 100) !== value * 100) return 'orders.form.discountDecimals'
  return undefined
}
