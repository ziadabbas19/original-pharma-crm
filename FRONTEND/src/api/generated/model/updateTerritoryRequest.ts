/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface UpdateTerritoryRequest {
  name: string
  /** @nullable */
  nameAr: string | null
  /** @nullable */
  parentId: string | null
  /** @nullable */
  code?: string | null
}
