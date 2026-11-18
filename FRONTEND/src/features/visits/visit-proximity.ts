import { distanceMeters } from '../../lib/geo.ts'

/**
 * What the rep is told before a visit starts. The server decides the final outcome with the same rules
 * (GeofenceEvaluator in the API); this copy lets the app answer without a connection.
 */

export interface VisitRules {
  maxAccuracyMeters: number
  maxAccuracyAllowanceMeters: number
  rejectOutsideGeofence: boolean
  maxPhotoBytes: number
  contentEditHours: number
}

/** Used until the server's rules have been loaded once on this device. */
export const DEFAULT_VISIT_RULES: VisitRules = {
  maxAccuracyMeters: 100,
  maxAccuracyAllowanceMeters: 50,
  rejectOutsideGeofence: false,
  maxPhotoBytes: 8 * 1024 * 1024,
  contentEditHours: 24,
}

export interface ProximityTarget {
  lat?: number | null
  lng?: number | null
  geofenceRadiusMeters: number
}

export interface ProximityFix {
  lat: number
  lng: number
  accuracy: number
  isMock: boolean
}

export type LocationFailure = 'denied' | 'timeout' | 'unavailable'

export type ProximityResult =
  | { state: 'noCustomerLocation' }
  | { state: 'locationUnavailable'; reason: LocationFailure }
  | { state: 'lowAccuracy'; accuracy: number; maxAccuracy: number }
  | { state: 'inside'; distance: number; allowed: number; accuracy: number; isMock: boolean }
  | {
      state: 'outside'
      distance: number
      allowed: number
      accuracy: number
      isMock: boolean
      /** This server refuses check-ins outside the geofence instead of flagging them. */
      refused: boolean
    }

/** Same order as the server: customer location, then accuracy, then the geofence. */
export function evaluateProximity(
  target: ProximityTarget,
  fix: ProximityFix | null,
  rules: VisitRules,
  failure: LocationFailure = 'unavailable',
): ProximityResult {
  if (target.lat == null || target.lng == null) return { state: 'noCustomerLocation' }
  if (!fix) return { state: 'locationUnavailable', reason: failure }
  if (fix.accuracy > rules.maxAccuracyMeters) {
    return { state: 'lowAccuracy', accuracy: fix.accuracy, maxAccuracy: rules.maxAccuracyMeters }
  }

  const distance = distanceMeters(target.lat, target.lng, fix.lat, fix.lng)
  const allowed =
    target.geofenceRadiusMeters + Math.min(Math.max(fix.accuracy, 0), rules.maxAccuracyAllowanceMeters)
  const reading = { distance, allowed, accuracy: fix.accuracy, isMock: fix.isMock }
  return distance <= allowed
    ? { state: 'inside', ...reading }
    : { state: 'outside', ...reading, refused: rules.rejectOutsideGeofence }
}

/** Whether the rep may start the visit with this result. */
export function canStartVisit(result: ProximityResult): boolean {
  return result.state === 'inside' || (result.state === 'outside' && !result.refused)
}

/** Whether a supervisor will be asked to look at a visit started with this result. */
export function willNeedReview(result: ProximityResult): boolean {
  return (
    (result.state === 'inside' || result.state === 'outside') && (result.state === 'outside' || result.isMock)
  )
}

/** Browser and plugin errors, in the three cases the rep can act on. */
export function locationFailureOf(error: unknown): LocationFailure {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 1) return 'denied'
  if (code === 3) return 'timeout'
  return 'unavailable'
}
