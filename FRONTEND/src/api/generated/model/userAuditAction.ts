/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type UserAuditAction = (typeof UserAuditAction)[keyof typeof UserAuditAction]

export const UserAuditAction = {
  created: 'created',
  passwordChanged: 'passwordChanged',
  passwordReset: 'passwordReset',
  productLinesChanged: 'productLinesChanged',
} as const
