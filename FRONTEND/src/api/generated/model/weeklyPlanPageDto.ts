/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { WeeklyPlanListItemDto } from './weeklyPlanListItemDto'

export interface WeeklyPlanPageDto {
  items: WeeklyPlanListItemDto[]
  total: number
  page: number
  pageSize: number
}
