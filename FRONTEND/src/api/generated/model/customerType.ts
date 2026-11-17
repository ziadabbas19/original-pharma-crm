/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type CustomerType = (typeof CustomerType)[keyof typeof CustomerType]

export const CustomerType = {
  doctor: 'doctor',
  pharmacy: 'pharmacy',
} as const
