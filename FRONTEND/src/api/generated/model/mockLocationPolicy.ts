/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type MockLocationPolicy = (typeof MockLocationPolicy)[keyof typeof MockLocationPolicy]

export const MockLocationPolicy = {
  flagOnly: 'flagOnly',
  flagAndExclude: 'flagAndExclude',
} as const
