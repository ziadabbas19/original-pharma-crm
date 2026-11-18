/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType]

export const NotificationType = {
  orderApproved: 'orderApproved',
  orderRejected: 'orderRejected',
  orderCancelled: 'orderCancelled',
  orderDelivered: 'orderDelivered',
  visitFeedback: 'visitFeedback',
  visitFeedbackReply: 'visitFeedbackReply',
} as const
