/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface OrderLineDto {
  id: string
  productId: string
  productNameAr: string
  productNameEn: string
  /** @nullable */
  thumbnailUrl: string | null
  quantity: number
  unitPrice: number
  discountPercent: number
  discountAmount: number
  lineTotal: number
  exceededStock: boolean
}
