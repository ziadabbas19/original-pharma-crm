/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { RepAmPlaceDto } from './repAmPlaceDto'

export interface RepTodayDto {
  day: string
  /** @nullable */
  areaId: string | null
  /** @nullable */
  territoryId: string | null
  areaChosen: boolean
  /** @nullable */
  planCityId: string | null
  doctorOrder: string[]
  amPlaces: RepAmPlaceDto[]
}
