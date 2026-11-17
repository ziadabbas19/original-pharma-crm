/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface UpdateUserRequest {
  fullName: string
  /** @nullable */
  managerId: string | null
  /** @nullable */
  territoryId: string | null
  preferredLanguage?: string
}
