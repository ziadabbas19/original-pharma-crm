/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { BulkItemResult } from './bulkItemResult'

export interface BulkResult {
  deleted: number
  archived: number
  restored: number
  updated: number
  blocked: number
  dryRun: boolean
  items: BulkItemResult[]
}
