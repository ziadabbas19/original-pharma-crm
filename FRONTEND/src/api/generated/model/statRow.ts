/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface StatRow {
  key: string
  name: string
  /** @nullable */
  nameAr: string | null
  count: number
  value?: number
  quantity?: number
}
