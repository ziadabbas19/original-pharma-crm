/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface ExpenseCityTotalDto {
  cityId: string
  cityName: string
  /** @nullable */
  cityNameAr: string | null
  total: number
  days: number
}
