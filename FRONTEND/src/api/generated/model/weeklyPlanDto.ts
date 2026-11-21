/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { WeeklyPlanDayDto } from './weeklyPlanDayDto'
import type { WeeklyPlanEventDto } from './weeklyPlanEventDto'
import type { WeeklyPlanProgressDto } from './weeklyPlanProgressDto'
import type { WeeklyPlanStatus } from './weeklyPlanStatus'

export interface WeeklyPlanDto {
  /** @nullable */
  id: string | null
  userId: string
  userName: string
  weekStart: string
  weekEnd: string
  status: WeeklyPlanStatus
  version: number
  /** @nullable */
  reviewNote: string | null
  /** @nullable */
  reviewedByName: string | null
  /** @nullable */
  reviewedAt: string | null
  /** @nullable */
  submittedAt: string | null
  /** @nullable */
  updatedAt: string | null
  days: WeeklyPlanDayDto[]
  progress: WeeklyPlanProgressDto
  history: WeeklyPlanEventDto[]
  canEdit: boolean
  canSubmit: boolean
  canReview: boolean
  canReopen: boolean
  /** @nullable */
  reviewerName: string | null
  today: string
  currentWeekStart: string
}
