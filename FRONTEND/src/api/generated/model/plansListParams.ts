/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { WeeklyPlanStatus } from './weeklyPlanStatus'

export type PlansListParams = {
  status?: WeeklyPlanStatus
  userId?: string
  week?: string
  page?: number
  pageSize?: number
}
