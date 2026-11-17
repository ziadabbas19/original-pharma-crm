/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { LivePositionDto } from './livePositionDto'
import type { PresenceStatus } from './presenceStatus'

export interface RepPresenceDto {
  userId: string
  fullName: string
  /** @nullable */
  territoryId: string | null
  status: PresenceStatus
  /** @nullable */
  shiftId: string | null
  /** @nullable */
  lastSeenAt: string | null
  position: null | LivePositionDto
  deviceHealthy: boolean
  healthIssues: string[]
  openFlags: number
}
