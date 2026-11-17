/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type TerritoryLevel = (typeof TerritoryLevel)[keyof typeof TerritoryLevel]

export const TerritoryLevel = {
  region: 'region',
  area: 'area',
  town: 'town',
} as const
