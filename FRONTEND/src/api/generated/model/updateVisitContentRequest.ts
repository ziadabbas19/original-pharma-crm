/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { VisitFeedbackInput } from './visitFeedbackInput'
import type { VisitProductInput } from './visitProductInput'

export interface UpdateVisitContentRequest {
  feedback: null | VisitFeedbackInput
  products: VisitProductInput[]
  /** @nullable */
  clientUpdatedAt?: string | null
}
