/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { WeeklyPlanStatus } from './weeklyPlanStatus'

export interface WeeklyPlanListItemDto {
  id: string
  userId: string
  userName: string
  weekStart: string
  weekEnd: string
  status: WeeklyPlanStatus
  daysPlanned: number
  planned: number
  /** @nullable */
  submittedAt: string | null
  /** @nullable */
  reviewedAt: string | null
  /** @nullable */
  reviewedByName: string | null
  updatedAt: string
}
