/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type ClientKind = (typeof ClientKind)[keyof typeof ClientKind]

export const ClientKind = {
  web: 'web',
  native: 'native',
} as const
