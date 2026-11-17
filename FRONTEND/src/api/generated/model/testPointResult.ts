/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface TestPointResult {
  received: boolean
  serverTime: string
  clockOffsetSeconds: number
  anomalyScore: number
  signals: string[]
}
