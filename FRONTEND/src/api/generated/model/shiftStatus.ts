/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus]

export const ShiftStatus = {
  active: 'active',
  ended: 'ended',
} as const
