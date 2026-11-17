/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type NotificationPermissionState =
  (typeof NotificationPermissionState)[keyof typeof NotificationPermissionState]

export const NotificationPermissionState = {
  unknown: 'unknown',
  granted: 'granted',
  denied: 'denied',
  prompt: 'prompt',
  notRequired: 'notRequired',
} as const
