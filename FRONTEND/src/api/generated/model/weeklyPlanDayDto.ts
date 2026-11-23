/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { WeeklyPlanCustomerDto } from './weeklyPlanCustomerDto'

export interface WeeklyPlanDayDto {
  day: string
  cityId: string
  cityName: string
  /** @nullable */
  cityNameAr: string | null
  targetVisits: number
  /** @nullable */
  note: string | null
  customers: WeeklyPlanCustomerDto[]
  /** @nullable */
  amPlaces?: WeeklyPlanCustomerDto[] | null
}
