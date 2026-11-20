/**
 * The two status rows of the rep's Account screen, from the device health check (same issue codes as
 * features/onboarding/health.ts). Kept free of React so it can be tested directly.
 */

export type StatusState = 'ok' | 'attention' | 'unknown'

const LOCATION_ISSUES = new Set([
  'location-permission-missing',
  'background-location-missing',
  'approximate-location',
  'location-services-off',
  'mock-location',
])

export function accountStatus(
  issues: readonly string[],
  checked: boolean,
): { location: StatusState; notifications: StatusState } {
  if (!checked) return { location: 'unknown', notifications: 'unknown' }
  return {
    location: issues.some((issue) => LOCATION_ISSUES.has(issue)) ? 'attention' : 'ok',
    notifications: issues.includes('notifications-denied') ? 'attention' : 'ok',
  }
}
