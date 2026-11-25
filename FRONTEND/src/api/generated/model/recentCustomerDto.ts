/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { CustomerType } from './customerType'

export interface RecentCustomerDto {
  id: string
  type: CustomerType
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  lat: number | null
  /** @nullable */
  lng: number | null
  geofenceRadiusMeters: number
  /** @nullable */
  phone: string | null
  /** @nullable */
  address: string | null
  /** @nullable */
  landmark: string | null
  /** @nullable */
  townId: string | null
  /** @nullable */
  townName: string | null
  /** @nullable */
  townNameAr: string | null
  lastVisitAt: string
}
