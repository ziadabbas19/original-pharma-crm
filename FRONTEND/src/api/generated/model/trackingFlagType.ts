/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type TrackingFlagType = (typeof TrackingFlagType)[keyof typeof TrackingFlagType]

export const TrackingFlagType = {
  anomaly: 'anomaly',
  mockLocation: 'mockLocation',
  trackingLost: 'trackingLost',
  unhealthyDevice: 'unhealthyDevice',
  integrityFailed: 'integrityFailed',
  visitOutsideGeofence: 'visitOutsideGeofence',
} as const
