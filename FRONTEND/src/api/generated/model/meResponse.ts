/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { PermissionGrantDto } from './permissionGrantDto'
import type { UserProfileDto } from './userProfileDto'

export interface MeResponse {
  user: UserProfileDto
  permissions: PermissionGrantDto[]
  permissionsVersion: number
  /** @nullable */
  maxDiscountPercent?: number | null
}
