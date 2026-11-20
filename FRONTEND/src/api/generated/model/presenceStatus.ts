/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type PresenceStatus = (typeof PresenceStatus)[keyof typeof PresenceStatus]

export const PresenceStatus = {
  offShift: 'offShift',
  online: 'online',
  idle: 'idle',
  trackingLost: 'trackingLost',
  notOnVisit: 'notOnVisit',
} as const
