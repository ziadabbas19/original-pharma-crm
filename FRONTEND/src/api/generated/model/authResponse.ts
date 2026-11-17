/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { UserProfileDto } from './userProfileDto'

export interface AuthResponse {
  accessToken: string
  expiresAt: string
  expiresIn: number
  /** @nullable */
  refreshToken: string | null
  /** @nullable */
  refreshTokenExpiresAt: string | null
  user: UserProfileDto
}
