/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type LocationPermissionState = (typeof LocationPermissionState)[keyof typeof LocationPermissionState]

export const LocationPermissionState = {
  none: 'none',
  whileInUse: 'whileInUse',
  always: 'always',
} as const
