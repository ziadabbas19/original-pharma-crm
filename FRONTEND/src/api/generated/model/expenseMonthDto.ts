/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ExpenseCityTotalDto } from './expenseCityTotalDto'
import type { ExpenseDayTotalDto } from './expenseDayTotalDto'
import type { ExpenseStatementDayDto } from './expenseStatementDayDto'

export interface ExpenseMonthDto {
  userId: string
  userName: string
  month: string
  from: string
  to: string
  total: number
  daysWithExpenses: number
  byCity: ExpenseCityTotalDto[]
  byDay: ExpenseDayTotalDto[]
  days: ExpenseStatementDayDto[]
}
