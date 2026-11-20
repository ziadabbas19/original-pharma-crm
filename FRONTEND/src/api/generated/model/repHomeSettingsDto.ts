/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { RepHomeConfigDto } from './repHomeConfigDto'
import type { RepHomeSectionDto } from './repHomeSectionDto'

export interface RepHomeSettingsDto {
  sections: RepHomeSectionDto[]
  dailyVisitTarget: number
  isDefault: boolean
  /** @nullable */
  updatedAt: string | null
  /** @nullable */
  updatedByName: string | null
  defaults: RepHomeConfigDto
}
