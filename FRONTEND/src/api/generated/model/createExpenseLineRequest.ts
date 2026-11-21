/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface CreateExpenseLineRequest {
  day: string
  cityId: string
  amount: number
  /** @nullable */
  note?: string | null
  /** @nullable */
  id?: string | null
  /** @nullable */
  userId?: string | null
  /** @nullable */
  changedAt?: string | null
}
