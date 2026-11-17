/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface ProductDto {
  id: string
  productLineId: string
  lineNameAr: string
  lineNameEn: string
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
}
