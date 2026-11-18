/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface ProductDto {
  id: string
  /** @nullable */
  productLineId: string | null
  /** @nullable */
  lineNameAr: string | null
  /** @nullable */
  lineNameEn: string | null
  nameAr: string
  nameEn: string
  /** @nullable */
  description: string | null
  price: number
  stockQuantity: number
  /** @nullable */
  imageUrl: string | null
  /** @nullable */
  thumbnailUrl: string | null
  isActive: boolean
  /** @nullable */
  updatedAt: string | null
  /** @nullable */
  defaultDiscountPercent?: number | null
  /** @nullable */
  maxDiscountPercent?: number | null
  /** @nullable */
  lineDefaultDiscountPercent?: number | null
  /** @nullable */
  lineMaxDiscountPercent?: number | null
  /** @nullable */
  effectiveDefaultDiscountPercent?: number | null
  /** @nullable */
  effectiveMaxDiscountPercent?: number | null
  usageCount?: number
  /** @nullable */
  archivedAt?: string | null
}
