/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { WeeklyPlanDayInput } from './weeklyPlanDayInput'

export interface SaveWeeklyPlanRequest {
  week: string
  days: WeeklyPlanDayInput[]
  /** @nullable */
  version?: number | null
}
