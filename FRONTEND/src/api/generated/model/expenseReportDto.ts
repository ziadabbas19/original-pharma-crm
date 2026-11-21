/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ExpenseCityTotalDto } from './expenseCityTotalDto'
import type { ExpenseDayTotalDto } from './expenseDayTotalDto'
import type { ExpenseLineDto } from './expenseLineDto'
import type { ExpenseRepTotalDto } from './expenseRepTotalDto'

export interface ExpenseReportDto {
  from: string
  to: string
  total: number
  lines: ExpenseLineDto[]
  byRep: ExpenseRepTotalDto[]
  byCity: ExpenseCityTotalDto[]
  byDay: ExpenseDayTotalDto[]
  truncated: boolean
}
