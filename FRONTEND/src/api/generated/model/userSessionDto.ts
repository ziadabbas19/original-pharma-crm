/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ClientKind } from './clientKind'

export interface UserSessionDto {
  id: string
  client: ClientKind
  /** @nullable */
  deviceId: string | null
  /** @nullable */
  deviceName: string | null
  isBackground: boolean
  createdAt: string
  lastUsedAt: string
  expiresAt: string
  absoluteExpiresAt: string
  isCurrent: boolean
}
