/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */

export interface VisitRulesDto {
  maxAccuracyMeters: number
  maxAccuracyAllowanceMeters: number
  rejectOutsideGeofence: boolean
  maxPhotoBytes: number
  contentEditHours: number
  maxDistanceFromDoctorMeters?: number
  lowTrustAccuracyMeters?: number
}
