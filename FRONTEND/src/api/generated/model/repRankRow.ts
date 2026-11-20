/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface RepRankRow {
  repId: string
  name: string
  orders: number
  orderValue: number
  visits: number
  doctorsCovered: number
  trackingHours: number
  activeDays: number
  distanceKm?: number
}
