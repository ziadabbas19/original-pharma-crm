/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { PermissionScope } from './permissionScope'

export interface PermissionOverrideDto {
  key: string
  isGranted: boolean
  scope: null | PermissionScope
  /** @nullable */
  expiresAt: string | null
  /** @nullable */
  reason: string | null
}
