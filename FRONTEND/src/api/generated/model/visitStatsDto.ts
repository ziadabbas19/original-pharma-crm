/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { RepDayRow } from './repDayRow'
import type { StatRow } from './statRow'
import type { StatsRange } from './statsRange'
import type { TrendPoint } from './trendPoint'

export interface VisitStatsDto {
  range: StatsRange
  visitCount: number
  verified: number
  unverified: number
  completed: number
  averagePerRepDay: number
  doctorsOnList: number
  doctorsCovered: number
  trend: TrendPoint[]
  perRepPerDay: RepDayRow[]
  byRep: StatRow[]
  productsDiscussed: StatRow[]
  feedbackByCategory: StatRow[]
}
