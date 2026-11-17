/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export type PlaceType = (typeof PlaceType)[keyof typeof PlaceType]

export const PlaceType = {
  pharmacy: 'pharmacy',
  warehouse: 'warehouse',
  shop: 'shop',
  other: 'other',
} as const
