/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { RoleAuditAction } from './roleAuditAction'
import type { RoleAuditChangeDto } from './roleAuditChangeDto'

export interface RoleAuditEntryDto {
  id: string
  roleId: string
  roleKey: string
  action: RoleAuditAction
  /** @nullable */
  actorId: string | null
  actorName: string
  changes: RoleAuditChangeDto[]
  createdAt: string
}
