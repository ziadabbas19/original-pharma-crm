/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { PlaceType } from './placeType'

export interface PlaceSuggestionDto {
  name: string
  placeType: PlaceType
  /** @nullable */
  customerId: string | null
}
