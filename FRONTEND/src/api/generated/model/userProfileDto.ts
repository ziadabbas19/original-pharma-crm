/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { RoleSummaryDto } from './roleSummaryDto'

export interface UserProfileDto {
  id: string
  email: string
  fullName: string
  preferredLanguage: string
  roles: RoleSummaryDto[]
  /** @nullable */
  managerId: string | null
  /** @nullable */
  territoryId: string | null
  mustChangePassword?: boolean
  /** @nullable */
  avatarUrl?: string | null
  /** @nullable */
  avatarThumbnailUrl?: string | null
}
