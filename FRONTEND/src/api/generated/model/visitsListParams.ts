/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { VisitFeedbackCategory } from './visitFeedbackCategory'
import type { VisitStatus } from './visitStatus'

export type VisitsListParams = {
  from?: string
  to?: string
  userId?: string
  status?: VisitStatus
  needsReview?: boolean
  mine?: boolean
  productId?: string
  feedbackCategory?: VisitFeedbackCategory
  hasFeedback?: boolean
  archived?: boolean
}
