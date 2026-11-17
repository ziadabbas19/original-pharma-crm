/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { OrderHistoryDto } from './orderHistoryDto'
import type { OrderLineDto } from './orderLineDto'
import type { OrderStatus } from './orderStatus'
import type { PlaceType } from './placeType'
import type { StockWarningDto } from './stockWarningDto'

export interface OrderDto {
  id: string
  number: string
  clientRequestId: string
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
  customerId: string | null
  /** @nullable */
  collectionMethodId: string | null
  /** @nullable */
  collectionMethodNameAr: string | null
  /** @nullable */
  collectionMethodNameEn: string | null
  /** @nullable */
  collectionMethodOther: string | null
  /** @nullable */
  notes: string | null
  status: OrderStatus
  /** @nullable */
  statusReason: string | null
  subtotal: number
  discountTotal: number
  total: number
  createdAt: string
  updatedAt: string
  lines: OrderLineDto[]
  history: OrderHistoryDto[]
  stockWarnings: StockWarningDto[]
  canEdit: boolean
  canCancel: boolean
  canReview: boolean
}
