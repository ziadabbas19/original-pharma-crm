/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { PermissionGrantDto } from './permissionGrantDto'

export interface SetRolePermissionsRequest {
  permissions: PermissionGrantDto[]
}
