/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface ExpenseDayTotalDto {
  day: string
  total: number
  lineCount: number
  hasNote: boolean
  hasEdited: boolean
}
