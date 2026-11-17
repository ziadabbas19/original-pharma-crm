/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { OrderLineInput } from './orderLineInput'
import type { PlaceType } from './placeType'

export interface CreateOrderRequest {
  clientRequestId: string
  orderDate: string
  placeType: PlaceType
  placeName: string
  lines: OrderLineInput[]
  /** @nullable */
  customerId?: string | null
  /** @nullable */
  collectionMethodId?: string | null
  /** @nullable */
  collectionMethodOther?: string | null
  /** @nullable */
  notes?: string | null
}
