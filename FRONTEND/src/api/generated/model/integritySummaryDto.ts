/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { MockLocationPolicy } from './mockLocationPolicy'
import type { ReasonCountDto } from './reasonCountDto'

export interface IntegritySummaryDto {
  from: string
  to: string
  openEvents: number
  acknowledgedEvents: number
  totalEvents: number
  repsFlagged: number
  suspiciousPoints: number
  rejectedPoints: number
  mockPoints: number
  flaggedVisits: number
  topReasons: ReasonCountDto[]
  mockPolicy: MockLocationPolicy
}
