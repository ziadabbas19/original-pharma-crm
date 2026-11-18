/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type VisitFeedbackCategory = (typeof VisitFeedbackCategory)[keyof typeof VisitFeedbackCategory] | null

export const VisitFeedbackCategory = {
  positive: 'positive',
  needsFollowUp: 'needsFollowUp',
  complaint: 'complaint',
  request: 'request',
} as const
