/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ShiftDto } from './shiftDto'
import type { TrackingConfigDto } from './trackingConfigDto'

export interface StartShiftResponse {
  shift: ShiftDto
  config: TrackingConfigDto
}
