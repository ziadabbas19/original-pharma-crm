/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { CustomerType } from './customerType'

export interface CustomerDto {
  id: string
  type: CustomerType
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  address: string | null
  /** @nullable */
  territoryId: string | null
  /** @nullable */
  territoryName: string | null
  /** @nullable */
  territoryNameAr: string | null
  /** @nullable */
  lat: number | null
  /** @nullable */
  lng: number | null
  geofenceRadiusMeters: number
  hasQrCode: boolean
  isActive: boolean
  createdAt: string
  /** @nullable */
  phone?: string | null
  /** @nullable */
  notes?: string | null
  usageCount?: number
  /** @nullable */
  archivedAt?: string | null
  /** @nullable */
  landmark?: string | null
}
