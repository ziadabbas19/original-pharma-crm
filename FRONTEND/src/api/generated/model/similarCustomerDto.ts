/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { CustomerType } from './customerType'

export interface SimilarCustomerDto {
  /** @nullable */
  id: string | null
  type: CustomerType
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  townName: string | null
  /** @nullable */
  townNameAr: string | null
  /** @nullable */
  areaName: string | null
  /** @nullable */
  areaNameAr: string | null
  same: boolean
  limited: boolean
  /** @nullable */
  address?: string | null
  /** @nullable */
  landmark?: string | null
  /** @nullable */
  addedByName?: string | null
  /** @nullable */
  inMyList?: boolean | null
  isInactive?: boolean
}
