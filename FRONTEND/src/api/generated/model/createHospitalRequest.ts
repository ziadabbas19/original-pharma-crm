/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface CreateHospitalRequest {
  name: string
  /** @nullable */
  nameAr: string | null
  territoryId: string
  /** @nullable */
  address?: string | null
  /** @nullable */
  landmark?: string | null
  /** @nullable */
  phone?: string | null
  /** @nullable */
  notes?: string | null
  /** @nullable */
  repId?: string | null
  duplicateConfirmed?: boolean
}
