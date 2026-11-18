/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { StatsSection } from './statsSection'

export type StatsExportParams = {
  section?: StatsSection
  table?: string
  From?: string
  To?: string
  RepId?: string
  AreaId?: string
  LineId?: string
  ProductId?: string
  lang?: string
}
