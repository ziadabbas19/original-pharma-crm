/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { ClientKind } from './clientKind'

export interface LoginRequest {
  email: string
  password: string
  client?: ClientKind
  /** @nullable */
  deviceId?: string | null
  /** @nullable */
  deviceName?: string | null
}
