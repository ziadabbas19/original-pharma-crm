/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type LocationTrustStatus = (typeof LocationTrustStatus)[keyof typeof LocationTrustStatus]

export const LocationTrustStatus = {
  trusted: 'trusted',
  suspicious: 'suspicious',
  rejected: 'rejected',
} as const
