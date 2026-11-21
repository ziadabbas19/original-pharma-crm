/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { CustomerType } from './customerType'

export interface WeeklyPlanCustomerDto {
  customerId: string
  type: CustomerType
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  townId: string | null
  visited: boolean
}
