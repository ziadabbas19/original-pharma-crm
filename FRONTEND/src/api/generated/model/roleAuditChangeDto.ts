/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface RoleAuditChangeDto {
  field: string
  /** @nullable */
  before: string | null
  /** @nullable */
  after: string | null
}
