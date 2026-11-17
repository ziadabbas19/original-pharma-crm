/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { JsonElement } from './jsonElement'
import type { UserAuditAction } from './userAuditAction'

export interface UserAuditEntryDto {
  id: string
  action: UserAuditAction
  actorName: string
  details: JsonElement
  createdAt: string
}
