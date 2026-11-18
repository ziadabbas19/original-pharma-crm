/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface LookupDto {
  id: string
  nameAr: string
  nameEn: string
  isActive: boolean
  sortOrder: number
  usageCount?: number
  /** @nullable */
  archivedAt?: string | null
}
