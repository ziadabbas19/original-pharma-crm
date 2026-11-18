/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { AuditAction } from './auditAction'

export type AuditListParams = {
  EntityType?: string
  EntityId?: string
  Action?: AuditAction
  Limit?: number
}
