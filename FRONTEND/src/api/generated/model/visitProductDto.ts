/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface VisitProductDto {
  productId: string
  nameAr: string
  nameEn: string
  /** @nullable */
  thumbnailUrl: string | null
  /** @nullable */
  productLineId: string | null
  /** @nullable */
  note: string | null
}
