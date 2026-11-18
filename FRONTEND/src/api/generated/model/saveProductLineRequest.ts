/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface SaveProductLineRequest {
  nameAr: string
  nameEn: string
  /** @nullable */
  description: string | null
  isActive?: boolean
  /** @nullable */
  defaultDiscountPercent?: number | null
  /** @nullable */
  maxDiscountPercent?: number | null
}
