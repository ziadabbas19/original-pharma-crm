/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type OrderHistoryAction = (typeof OrderHistoryAction)[keyof typeof OrderHistoryAction]

export const OrderHistoryAction = {
  created: 'created',
  edited: 'edited',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
  delivered: 'delivered',
  archived: 'archived',
  restored: 'restored',
} as const
