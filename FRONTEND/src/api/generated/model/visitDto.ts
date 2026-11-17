/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { VisitPhotoDto } from './visitPhotoDto'
import type { VisitStatus } from './visitStatus'

export interface VisitDto {
  id: string
  customerId: string
  /** @nullable */
  customerName: string | null
  userId: string
  status: VisitStatus
  checkInAt: string
  checkInDistanceMeters: number
  checkInWithinGeofence: boolean
  /** @nullable */
  checkOutAt: string | null
  /** @nullable */
  checkOutDistanceMeters: number | null
  /** @nullable */
  checkOutWithinGeofence: boolean | null
  qrVerified: boolean
  needsReview: boolean
  photos: VisitPhotoDto[]
}
