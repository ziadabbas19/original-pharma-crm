/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type RoleAuditAction = (typeof RoleAuditAction)[keyof typeof RoleAuditAction]

export const RoleAuditAction = {
  created: 'created',
  updated: 'updated',
  permissionsChanged: 'permissionsChanged',
  deleted: 'deleted',
  usersReassigned: 'usersReassigned',
} as const
