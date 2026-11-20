import type { ClinicLocationOutcome, VisitLocationDto } from '../../api/generated/model'

/**
 * How the dashboard shows where a visit was recorded. The numbers come from the server (stored with the
 * visit when it was recorded); this only decides what to show, so it can be tested without a browser.
 */

export type LocationBadge = 'drift' | 'flagged' | 'firstVisit' | 'notSaved'

/** Badges for a visit row, most important first. */
export function locationBadges(
  location: VisitLocationDto | null | undefined,
  needsReview: boolean,
): LocationBadge[] {
  const badges: LocationBadge[] = []
  if (location?.locationDrift) badges.push('drift')
  if (needsReview) badges.push('flagged')
  if (location?.clinicLocationOutcome === 'savedAsClinic') badges.push('firstVisit')
  if (location?.clinicLocationOutcome === 'notSaved') badges.push('notSaved')
  return badges
}

export interface DistanceCell {
  key: 'clinic' | 'previous' | 'median'
  meters: number | null
  /** This comparison is one of the reasons the visit was marked as drift. */
  exceeded: boolean
}

/** The three comparisons of a visit, in the order the dashboard shows them. */
export function distanceCells(location: VisitLocationDto | null | undefined): DistanceCell[] {
  const sources = new Set(location?.driftSources ?? [])
  return [
    { key: 'clinic', meters: location?.clinicDistanceMeters ?? null, exceeded: sources.has('clinic') },
    {
      key: 'previous',
      meters: location?.previousVisitDistanceMeters ?? null,
      exceeded: sources.has('previous'),
    },
    { key: 'median', meters: location?.medianDistanceMeters ?? null, exceeded: sources.has('median') },
  ]
}

/** Numbers visits by date: the oldest is 1, so the numbers on the map never change as visits are added. */
export function numberByDate<T extends { visitId: string; checkInAt: string }>(
  visits: readonly T[],
): Map<string, number> {
  const ordered = [...visits].sort(
    (a, b) => new Date(a.checkInAt).getTime() - new Date(b.checkInAt).getTime(),
  )
  return new Map(ordered.map((visit, index) => [visit.visitId, index + 1]))
}

/** What the location source line says about a saved clinic location. */
export function clinicOutcomeKey(outcome: ClinicLocationOutcome | null | undefined): string | null {
  switch (outcome) {
    case 'savedAsClinic':
      return 'visits.location.outcomes.savedAsClinic'
    case 'notSaved':
      return 'visits.location.outcomes.notSaved'
    default:
      return null
  }
}

/** A link that opens the point in OpenStreetMap (a new tab; nothing is sent until it is clicked). */
export function mapLink(lat: number, lng: number): string {
  const la = lat.toFixed(6)
  const ln = lng.toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${ln}#map=18/${la}/${ln}`
}

/** "2 d 3 h" style gap between two visits, in whole units. */
export function gapParts(
  seconds: number | null | undefined,
): { days: number; hours: number; minutes: number } | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  const minutes = Math.floor(seconds / 60)
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 }
}
