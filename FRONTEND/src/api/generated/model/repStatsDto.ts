/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { RepRankRow } from './repRankRow'
import type { StatsRange } from './statsRange'

export interface RepStatsDto {
  range: StatsRange
  reps: RepRankRow[]
}
