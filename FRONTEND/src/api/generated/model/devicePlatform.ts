/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform]

export const DevicePlatform = {
  android: 'android',
  ios: 'ios',
  web: 'web',
} as const
