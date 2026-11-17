/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { UserListItemDto } from './userListItemDto'

export interface CreatedUserDto {
  user: UserListItemDto
  /** @nullable */
  temporaryPassword: string | null
}
