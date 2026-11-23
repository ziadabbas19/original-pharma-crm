/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface WeeklyPlanDayInput {
  day: string
  cityId: string
  targetVisits: number
  /** @nullable */
  note?: string | null
  /** @nullable */
  customerIds?: string[] | null
  /** @nullable */
  amPlaceIds?: string[] | null
}
