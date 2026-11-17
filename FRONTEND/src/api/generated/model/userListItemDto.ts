/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { RoleSummaryDto } from './roleSummaryDto'

export interface UserListItemDto {
  id: string
  email: string
  fullName: string
  roles: RoleSummaryDto[]
  /** @nullable */
  managerId: string | null
  /** @nullable */
  territoryId: string | null
  isActive: boolean
  /** @nullable */
  territoryName?: string | null
  /** @nullable */
  territoryNameAr?: string | null
  /** @nullable */
  managerName?: string | null
  preferredLanguage?: string
}
