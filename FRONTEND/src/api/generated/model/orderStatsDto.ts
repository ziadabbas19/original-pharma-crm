/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { StatRow } from './statRow'
import type { StatsRange } from './statsRange'
import type { TrendPoint } from './trendPoint'

export interface OrderStatsDto {
  range: StatsRange
  orderCount: number
  orderValue: number
  averageOrderValue: number
  discountTotal: number
  delivered: number
  notDelivered: number
  deliveredValue: number
  byStatus: StatRow[]
  trend: TrendPoint[]
  topProducts: StatRow[]
  topLines: StatRow[]
  byRep: StatRow[]
  byArea: StatRow[]
  byPlaceType: StatRow[]
  byCollectionMethod: StatRow[]
}
