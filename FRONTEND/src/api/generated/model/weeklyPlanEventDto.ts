/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { WeeklyPlanStatus } from './weeklyPlanStatus'

export interface WeeklyPlanEventDto {
  id: string
  fromStatus: null | WeeklyPlanStatus
  toStatus: WeeklyPlanStatus
  actorName: string
  /** @nullable */
  note: string | null
  createdAt: string
}
