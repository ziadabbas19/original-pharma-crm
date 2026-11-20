/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface IntegrityVisitDto {
  id: string
  customerName: string
  /** @nullable */
  customerNameAr: string | null
  checkInAt: string
  /** @nullable */
  checkOutAt: string | null
  checkInDistanceMeters: number
  checkInAccuracy: number
  /** @nullable */
  checkOutDistanceMeters: number | null
  checkInIsMock: boolean
  /** @nullable */
  checkOutIsMock: boolean | null
  reviewReasons: string[]
}
