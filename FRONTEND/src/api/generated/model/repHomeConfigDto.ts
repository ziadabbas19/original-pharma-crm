/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { RepHomeSectionDto } from './repHomeSectionDto'

export interface RepHomeConfigDto {
  sections: RepHomeSectionDto[]
  dailyVisitTarget: number
}
