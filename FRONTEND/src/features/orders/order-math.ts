/**
 * Client-side estimate of order totals while the form is filled in. The server recomputes
 * everything; these use the same rules (amounts in piasters, rounded half away from zero).
 */
export interface DraftLine {
  productId: string
  quantity: number
  unitPrice: number
  discountPercent: number
}

export interface LineEstimate {
  gross: number
  discount: number
  total: number
}

function cents(value: number): number {
  return Math.round(value * 100)
}

export function estimateLine(line: DraftLine): LineEstimate {
  const gross = Math.max(0, Math.trunc(line.quantity)) * cents(line.unitPrice)
  const discount = Math.round(
    (gross * (Number.isFinite(line.discountPercent) ? line.discountPercent : 0)) / 100,
  )
  return { gross: gross / 100, discount: discount / 100, total: (gross - discount) / 100 }
}

export function estimateOrder(lines: DraftLine[]): { subtotal: number; discount: number; total: number } {
  let gross = 0
  let discount = 0
  for (const line of lines) {
    const e = estimateLine(line)
    gross += cents(e.gross)
    discount += cents(e.discount)
  }
  return { subtotal: gross / 100, discount: discount / 100, total: (gross - discount) / 100 }
}

/** RFC 4122 v4 id; crypto.randomUUID needs a secure context, so fall back to random bytes. */
export function newClientRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
