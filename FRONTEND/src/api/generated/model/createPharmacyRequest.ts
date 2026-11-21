/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface CreatePharmacyRequest {
  name: string
  /** @nullable */
  nameAr: string | null
  territoryId: string
  /** @nullable */
  address?: string | null
  /** @nullable */
  phone?: string | null
  /** @nullable */
  notes?: string | null
}
