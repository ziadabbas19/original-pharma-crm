/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { CustomerType } from './customerType'
import type { VisitFeedbackCategory } from './visitFeedbackCategory'
import type { VisitLocationDto } from './visitLocationDto'
import type { VisitStatus } from './visitStatus'

export interface VisitListItemDto {
  id: string
  userId: string
  userName: string
  customerId: string
  customerName: string
  /** @nullable */
  customerNameAr: string | null
  customerType: CustomerType
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
  photoCount: number
  checkInAccuracy: number
  checkInIsMock: boolean
  productIds: string[]
  reviewReasons: string[]
  hasFeedback?: boolean
  feedbackCategory?: null | VisitFeedbackCategory
  productCount?: number
  replyCount?: number
  /** @nullable */
  archivedAt?: string | null
  location?: null | VisitLocationDto
  /** @nullable */
  customerTerritoryId?: string | null
  /** @nullable */
  customerTerritoryName?: string | null
  /** @nullable */
  customerTerritoryNameAr?: string | null
}
