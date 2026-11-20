/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LocationVisibility } from './locationVisibility'

export interface LocationVisibilityDto {
  mode: LocationVisibility
  bufferMinutes: number
}
