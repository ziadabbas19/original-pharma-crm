/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { VisitFeedbackCategory } from './visitFeedbackCategory'
import type { VisitFeedbackSeenDto } from './visitFeedbackSeenDto'

export interface VisitFeedbackDto {
  text: string
  category: null | VisitFeedbackCategory
  createdAt: string
  updatedAt: string
  seenBy: VisitFeedbackSeenDto[]
}
