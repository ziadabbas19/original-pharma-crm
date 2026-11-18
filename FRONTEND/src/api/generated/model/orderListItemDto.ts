/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DeliveryStatus } from './deliveryStatus'
import type { OrderStatus } from './orderStatus'
import type { PlaceType } from './placeType'

export interface OrderListItemDto {
  id: string
  number: string
  userId: string
  repName: string
  /** @nullable */
  territoryId: string | null
  /** @nullable */
  territoryName: string | null
  /** @nullable */
  territoryNameAr: string | null
  orderDate: string
  placeType: PlaceType
  placeName: string
  /** @nullable */
  collectionMethodId: string | null
  /** @nullable */
  collectionMethodNameAr: string | null
  /** @nullable */
  collectionMethodNameEn: string | null
  /** @nullable */
  collectionMethodOther: string | null
  status: OrderStatus
  lineCount: number
  total: number
  createdAt: string
  discountTotal?: number
  delivery?: null | DeliveryStatus
  /** @nullable */
  decidedAt?: string | null
  /** @nullable */
  decidedByName?: string | null
  /** @nullable */
  statusReason?: string | null
  /** @nullable */
  deliveredAt?: string | null
  /** @nullable */
  archivedAt?: string | null
}
