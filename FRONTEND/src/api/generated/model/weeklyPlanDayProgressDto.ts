/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface WeeklyPlanDayProgressDto {
  day: string
  target: number
  done: number
  unplanned: number
  plannedCustomers: number
  plannedCustomersVisited: number
}
