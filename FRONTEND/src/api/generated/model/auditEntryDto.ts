/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { AuditAction } from './auditAction'
import type { JsonElement } from './jsonElement'

export interface AuditEntryDto {
  id: string
  entityType: string
  /** @nullable */
  entityId: string | null
  action: AuditAction
  /** @nullable */
  actorId: string | null
  actorName: string
  count: number
  details: JsonElement
  createdAt: string
}
