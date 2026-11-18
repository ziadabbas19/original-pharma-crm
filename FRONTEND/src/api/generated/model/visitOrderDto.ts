/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { OrderStatus } from './orderStatus'

export interface VisitOrderDto {
  id: string
  number: string
  status: OrderStatus
  total: number
  createdAt: string
}
