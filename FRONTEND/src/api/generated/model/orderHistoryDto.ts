/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { OrderHistoryAction } from './orderHistoryAction'
import type { OrderStatus } from './orderStatus'

export interface OrderHistoryDto {
  action: OrderHistoryAction
  fromStatus: null | OrderStatus
  toStatus: OrderStatus
  actorName: string
  /** @nullable */
  reason: string | null
  createdAt: string
}
