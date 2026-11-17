/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type VisitStatus = (typeof VisitStatus)[keyof typeof VisitStatus]

export const VisitStatus = {
  inProgress: 'inProgress',
  completed: 'completed',
  cancelled: 'cancelled',
} as const
