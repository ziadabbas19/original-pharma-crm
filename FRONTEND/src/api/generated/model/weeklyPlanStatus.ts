/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type WeeklyPlanStatus = (typeof WeeklyPlanStatus)[keyof typeof WeeklyPlanStatus]

export const WeeklyPlanStatus = {
  draft: 'draft',
  submitted: 'submitted',
  approved: 'approved',
  returned: 'returned',
} as const
