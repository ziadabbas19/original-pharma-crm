/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface RepAmPlaceDto {
  customerId: string
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  townId: string | null
  /** @nullable */
  townName: string | null
  /** @nullable */
  townNameAr: string | null
  position: number
  /** @nullable */
  plannedTime: string | null
}
