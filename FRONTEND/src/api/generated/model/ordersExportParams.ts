/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { OrderStatus } from './orderStatus'
import type { PlaceType } from './placeType'

export type OrdersExportParams = {
  From?: string
  To?: string
  RepId?: string
  AreaId?: string
  Status?: OrderStatus
  PlaceType?: PlaceType
  Place?: string
  CollectionMethodId?: string
  Mine?: boolean
  Search?: string
  lang?: string
}
