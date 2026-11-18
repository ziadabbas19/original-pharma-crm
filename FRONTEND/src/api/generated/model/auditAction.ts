/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction]

export const AuditAction = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  archived: 'archived',
  restored: 'restored',
  moved: 'moved',
  bulkDelete: 'bulkDelete',
  bulkRestore: 'bulkRestore',
} as const
