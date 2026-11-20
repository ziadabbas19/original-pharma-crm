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
  /** Fixes less accurate than this are weak evidence and never become a clinic location. */
  lowTrustAccuracyMeters?: number
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
  | {
      /**
       * The customer has no saved location yet. The visit starts normally; with a clean fix the server
       * keeps this visit's location as the clinic location, otherwise the visit is reviewed.
       */
      state: 'firstVisit'
      accuracy: number
      isMock: boolean
      /** The fix looks good enough to become the clinic location (the server decides). */
      willSave: boolean
    }
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

/**
 * Same order as the server: a fix, its accuracy, then the geofence. A customer without a saved location
 * never blocks the visit: its first good check-in becomes the clinic location.
 */
export function evaluateProximity(
  target: ProximityTarget,
  fix: ProximityFix | null,
  rules: VisitRules,
  failure: LocationFailure = 'unavailable',
): ProximityResult {
  if (!fix) return { state: 'locationUnavailable', reason: failure }
  if (fix.accuracy > rules.maxAccuracyMeters) {
    return { state: 'lowAccuracy', accuracy: fix.accuracy, maxAccuracy: rules.maxAccuracyMeters }
  }
  if (target.lat == null || target.lng == null) {
    const weakFrom = rules.lowTrustAccuracyMeters ?? rules.maxAccuracyMeters
    return {
      state: 'firstVisit',
      accuracy: fix.accuracy,
      isMock: fix.isMock,
      willSave: !fix.isMock && fix.accuracy <= weakFrom,
    }
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
  return (
    result.state === 'inside' ||
    result.state === 'firstVisit' ||
    (result.state === 'outside' && !result.refused)
  )
}

/** Whether a supervisor will be asked to look at a visit started with this result. */
export function willNeedReview(result: ProximityResult): boolean {
  if (result.state === 'firstVisit') return !result.willSave
  return (
    (result.state === 'inside' || result.state === 'outside') && (result.state === 'outside' || result.isMock)
  )
}

/** Distance and range stored with the visit on the device (a first visit is at the clinic by definition). */
export function checkInReading(result: ProximityResult): { distance: number; inside: boolean } | null {
  if (result.state === 'inside' || result.state === 'outside') {
    return { distance: result.distance, inside: result.state === 'inside' }
  }
  return result.state === 'firstVisit' ? { distance: 0, inside: true } : null
}

/** Browser and plugin errors, in the three cases the rep can act on. */
export function locationFailureOf(error: unknown): LocationFailure {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 1) return 'denied'
  if (code === 3) return 'timeout'
  return 'unavailable'
}
