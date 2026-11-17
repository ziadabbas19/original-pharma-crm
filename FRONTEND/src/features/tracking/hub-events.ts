import type { PresenceStatus } from '@/api/generated/model'

/**
 * Payloads that only travel over the SignalR hub (/hubs/tracking), so they are
 * not part of the OpenAPI document. Keep in sync with
 * BACKEND Application/Tracking/TrackingContracts.cs.
 * PositionUpdated and FlagRaised reuse LivePositionDto / TrackingFlagDto from the API client.
 */
export interface PresenceChangeDto {
  userId: string
  status: PresenceStatus
  at: string
}

export interface DeviceHealthChangeDto {
  userId: string
  deviceId: string
  isHealthy: boolean
  issues: string[]
  at: string
}
