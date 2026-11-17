/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ShiftStatus } from './shiftStatus'

export interface ShiftDto {
  id: string
  status: ShiftStatus
  deviceId: string
  startedAt: string
  /** @nullable */
  endedAt: string | null
  /** @nullable */
  lastPointAt: string | null
  /** @nullable */
  trackingLostAt: string | null
}
