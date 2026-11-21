/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ExpenseLineDto } from './expenseLineDto'

export interface ExpenseDayDto {
  userId: string
  userName: string
  day: string
  lines: ExpenseLineDto[]
  total: number
  /** @nullable */
  note: string | null
  /** @nullable */
  managerNote: string | null
  /** @nullable */
  managerNoteByName: string | null
  monthTotal: number
  canEdit: boolean
  canEditNote: boolean
  canManage: boolean
  editableFrom: string
  today: string
}
