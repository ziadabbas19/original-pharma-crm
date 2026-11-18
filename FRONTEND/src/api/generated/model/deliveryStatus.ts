/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus] | null

export const DeliveryStatus = {
  notDelivered: 'notDelivered',
  delivered: 'delivered',
} as const
