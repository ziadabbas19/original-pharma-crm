/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface TownDto {
  id: string
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  areaId: string | null
  /** @nullable */
  areaName: string | null
  /** @nullable */
  areaNameAr: string | null
  defaultDailyExpense?: number
  isOwn?: boolean
  /** @nullable */
  fallbackAmount?: number | null
}
