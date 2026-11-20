/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { CustomerType } from './customerType'
import type { VisitFeedbackDto } from './visitFeedbackDto'
import type { VisitLocationDto } from './visitLocationDto'
import type { VisitOrderDto } from './visitOrderDto'
import type { VisitPhotoDto } from './visitPhotoDto'
import type { VisitProductDto } from './visitProductDto'
import type { VisitReplyDto } from './visitReplyDto'
import type { VisitStatus } from './visitStatus'

export interface VisitDetailDto {
  id: string
  userId: string
  repName: string
  customerId: string
  customerName: string
  /** @nullable */
  customerNameAr: string | null
  customerType: CustomerType
  status: VisitStatus
  checkInAt: string
  /** @nullable */
  checkOutAt: string | null
  checkInDistanceMeters: number
  checkInWithinGeofence: boolean
  /** @nullable */
  checkOutDistanceMeters: number | null
  /** @nullable */
  checkOutWithinGeofence: boolean | null
  qrVerified: boolean
  needsReview: boolean
  /** @nullable */
  notes: string | null
  photoCount: number
  feedback: null | VisitFeedbackDto
  replies: VisitReplyDto[]
  products: VisitProductDto[]
  canEditContent: boolean
  /** @nullable */
  contentEditableUntil: string | null
  canReply: boolean
  canMarkSeen: boolean
  /** @nullable */
  archivedAt: string | null
  checkInReceivedAt: string
  checkInAccuracy: number
  checkInIsMock: boolean
  /** @nullable */
  checkOutAccuracy: number | null
  /** @nullable */
  checkOutIsMock: boolean | null
  geofenceRadiusMeters: number
  reviewReasons: string[]
  photos: VisitPhotoDto[]
  orders: VisitOrderDto[]
  location?: null | VisitLocationDto
  /** @nullable */
  checkOutLat?: number | null
  /** @nullable */
  checkOutLng?: number | null
  /** @nullable */
  clinicLat?: number | null
  /** @nullable */
  clinicLng?: number | null
}
