/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { VisitLocationDto } from './visitLocationDto'
import type { VisitStatus } from './visitStatus'

export interface DoctorVisitLocationDto {
  visitId: string
  repId: string
  repName: string
  checkInAt: string
  status: VisitStatus
  needsReview: boolean
  reviewReasons: string[]
  location: VisitLocationDto
}
