/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface LocationBatchResult {
  received: number
  accepted: number
  duplicates: number
  outsideShift: number
  anomalyScore: number
  flagged: boolean
}
