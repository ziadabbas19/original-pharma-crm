/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { BulkOutcome } from './bulkOutcome'

export interface BulkItemResult {
  id: string
  outcome: BulkOutcome
  /** @nullable */
  code?: string | null
  usageCount?: number
}
