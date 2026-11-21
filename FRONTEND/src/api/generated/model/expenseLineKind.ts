/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type ExpenseLineKind = (typeof ExpenseLineKind)[keyof typeof ExpenseLineKind]

export const ExpenseLineKind = {
  auto: 'auto',
  edited: 'edited',
  manual: 'manual',
} as const
