/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { CustomerType } from './customerType'

export type CustomersSimilarParams = {
  Type?: CustomerType
  Name?: string
  TerritoryId?: string
  Phone?: string
}
