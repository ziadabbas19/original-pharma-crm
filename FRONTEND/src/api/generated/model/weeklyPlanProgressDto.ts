/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { WeeklyPlanDayProgressDto } from './weeklyPlanDayProgressDto'

export interface WeeklyPlanProgressDto {
  planned: number
  done: number
  unplanned: number
  percent: number
  days: WeeklyPlanDayProgressDto[]
}
