/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { StatRow } from './statRow'
import type { StatsRange } from './statsRange'

export interface CatalogStatsDto {
  range: StatsRange
  lowStockThreshold: number
  productsPerLine: StatRow[]
  lowStock: StatRow[]
  activeUsersByRole: StatRow[]
}
