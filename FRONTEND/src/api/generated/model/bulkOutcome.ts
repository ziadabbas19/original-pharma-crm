/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type BulkOutcome = (typeof BulkOutcome)[keyof typeof BulkOutcome]

export const BulkOutcome = {
  deleted: 'deleted',
  archived: 'archived',
  restored: 'restored',
  updated: 'updated',
  blocked: 'blocked',
} as const
