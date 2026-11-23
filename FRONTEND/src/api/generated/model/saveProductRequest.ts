/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface SaveProductRequest {
  /** @nullable */
  productLineId: string | null
  nameAr: string
  nameEn: string
  /** @nullable */
  description: string | null
  price: number
  stockQuantity: number
  isActive?: boolean
  /** @nullable */
  defaultDiscountPercent?: number | null
  /** @nullable */
  maxDiscountPercent?: number | null
  /** @nullable */
  indications?: string | null
  /** @nullable */
  ingredients?: string | null
}
