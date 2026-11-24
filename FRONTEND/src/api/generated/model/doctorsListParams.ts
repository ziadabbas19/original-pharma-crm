/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DayOfWeek } from './dayOfWeek'

export type DoctorsListParams = {
  Mine?: boolean
  RepId?: string
  TownId?: string
  AreaId?: string
  SpecialtyId?: string
  Search?: string
  Unassigned?: boolean
  IncludeInactive?: boolean
  Archived?: boolean
  Weekday?: DayOfWeek
  TimeFrom?: string
  TimeTo?: string
  CreatedById?: string
  Page?: number
  PageSize?: number
  ListOf?: string
}
