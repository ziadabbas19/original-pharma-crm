/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface CreateRoleRequest {
  nameAr: string
  nameEn: string
  /** @nullable */
  description?: string | null
  /** @nullable */
  level?: number | null
  /** @nullable */
  copyFromRoleId?: string | null
}
