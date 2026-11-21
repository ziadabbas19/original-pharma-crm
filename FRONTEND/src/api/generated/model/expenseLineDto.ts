/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ExpenseLineKind } from './expenseLineKind'

export interface ExpenseLineDto {
  id: string
  userId: string
  userName: string
  day: string
  cityId: string
  cityName: string
  /** @nullable */
  cityNameAr: string | null
  amount: number
  /** @nullable */
  originalAmount: number | null
  kind: ExpenseLineKind
  /** @nullable */
  note: string | null
  createdAt: string
  /** @nullable */
  updatedAt: string | null
  /** @nullable */
  updatedByName: string | null
}
