/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface CreateUserRequest {
  email: string
  fullName: string
  /** @nullable */
  password: string | null
  roles: string[]
  /** @nullable */
  managerId?: string | null
  /** @nullable */
  territoryId?: string | null
  preferredLanguage?: string
  /** @nullable */
  productLineIds?: string[] | null
}
