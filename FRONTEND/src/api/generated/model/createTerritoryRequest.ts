/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { TerritoryLevel } from './territoryLevel'

export interface CreateTerritoryRequest {
  name: string
  /** @nullable */
  nameAr: string | null
  level: TerritoryLevel
  /** @nullable */
  parentId: string | null
  /** @nullable */
  code?: string | null
}
