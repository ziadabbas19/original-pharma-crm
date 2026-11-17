/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { PermissionScope } from './permissionScope'

export interface PermissionGrantDto {
  key: string
  scope: PermissionScope
}
