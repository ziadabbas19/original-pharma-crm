/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type TrackingFlagStatus = (typeof TrackingFlagStatus)[keyof typeof TrackingFlagStatus]

export const TrackingFlagStatus = {
  open: 'open',
  confirmed: 'confirmed',
  dismissed: 'dismissed',
  acknowledged: 'acknowledged',
} as const
