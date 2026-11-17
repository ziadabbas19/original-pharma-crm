/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

export const OrderStatus = {
  submitted: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
} as const
