/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface UpdateCustomerRequest {
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  address: string | null
  /** @nullable */
  territoryId: string | null
  /** @nullable */
  phone?: string | null
  /** @nullable */
  notes?: string | null
  /** @nullable */
  lat?: number | null
  /** @nullable */
  lng?: number | null
  geofenceRadiusMeters?: number
  isActive?: boolean
  /** @nullable */
  landmark?: string | null
}
