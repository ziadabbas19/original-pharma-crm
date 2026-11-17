/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { PermissionGrantDto } from './permissionGrantDto'

export interface RoleDto {
  id: string
  key: string
  nameAr: string
  nameEn: string
  /** @nullable */
  description: string | null
  isSystem: boolean
  level: number
  permissionsLocked: boolean
  userCount: number
  permissions: PermissionGrantDto[]
  /** @nullable */
  maxDiscountPercent?: number | null
}
