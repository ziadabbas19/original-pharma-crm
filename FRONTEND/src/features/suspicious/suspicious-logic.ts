import type { IntegrityEventDto } from '../../api/generated/model'

/**
 * Review page logic without React or the app's aliases, so the unit tests load this file directly.
 */

/** Reason codes the server can attach to an event (see AnomalyCodes and VisitReviewReasons). */
export const REASON_CODES = [
  'mock-location',
  'mock-app-selected',
  'emulator',
  'teleport',
  'impossible-speed',
  'frozen-position',
  'zero-altitude',
  'still-while-moving',
  'perfect-accuracy',
  'repeated-accuracy',
  'future-timestamp',
  'clock-drift',
  'far-from-doctor',
  'outside-geofence',
  'low-trust',
  'location-drift',
  'clinic-location-not-saved',
  'rooted-device',
  'spoofing-app-installed',
  'auto-time-off',
  'location-accessory',
  'ip-geo-mismatch',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

export const isReasonCode = (value: unknown): value is ReasonCode =>
  typeof value === 'string' && (REASON_CODES as readonly string[]).includes(value)

const pad = (n: number) => String(n).padStart(2, '0')

/** yyyy-mm-dd of an instant in the browser's time zone. */
export function localDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Start of a local yyyy-mm-dd day. */
export function startOfLocalDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const isDay = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(startOfLocalDay(value).getTime())

/** The default period of the review page: today and the six days before. */
export function defaultDays(now: Date): { from: string; to: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  return { from: localDay(from), to: localDay(now) }
}

/** API range for whole local days: from the start of `from` to the start of the day after `to`. */
export function rangeOf(from: string, to: string): { from: string; to: string } {
  const start = startOfLocalDay(from <= to ? from : to)
  const endDay = startOfLocalDay(from <= to ? to : from)
  const end = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** One rep on one day, with the events raised for them. */
export interface RepDayGroup {
  key: string
  userId: string
  userName: string
  day: string
  events: IntegrityEventDto[]
  /** Events still waiting for a reviewer. */
  open: number
  /** How often the problems were seen (events can repeat while open). */
  occurrences: number
  maxScore: number
  /** Every reason code seen that day, most frequent first. */
  reasons: string[]
  /** Latest time something was seen. */
  lastAt: string
  visits: number
}

/** Groups events per rep and local day: newest day first, then groups with open events, then by name. */
export function groupByRepAndDay(events: readonly IntegrityEventDto[]): RepDayGroup[] {
  const groups = new Map<string, RepDayGroup>()
  for (const event of events) {
    const day = localDay(event.createdAt)
    const key = `${day}|${event.userId}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        userId: event.userId,
        userName: event.userName,
        day,
        events: [],
        open: 0,
        occurrences: 0,
        maxScore: 0,
        reasons: [],
        lastAt: event.createdAt,
        visits: 0,
      }
      groups.set(key, group)
    }
    group.events.push(event)
    if (event.status === 'open') group.open += 1
    group.occurrences += event.occurrences
    group.maxScore = Math.max(group.maxScore, event.score)
    const seen = event.lastSeenAt ?? event.createdAt
    if (new Date(seen).getTime() > new Date(group.lastAt).getTime()) group.lastAt = seen
    if (event.visitId) group.visits += 1
  }

  for (const group of groups.values()) {
    const counts = new Map<string, number>()
    for (const event of group.events) for (const r of event.signals) counts.set(r, (counts.get(r) ?? 0) + 1)
    group.reasons = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([r]) => r)
    group.events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  return [...groups.values()].sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      Number(b.open > 0) - Number(a.open > 0) ||
      a.userName.localeCompare(b.userName),
  )
}

/** Where "open the evidence" goes: the visit, or the rep's route on that day around the point. */
export type EventTarget =
  | { kind: 'visit'; visitId: string }
  | { kind: 'map'; userId: string; day: string; at: string | null }
  /** Recorded outside the rep's visits in visit-only mode: only the time and reasons are shown. */
  | { kind: 'hidden' }

export function eventTarget(event: IntegrityEventDto): EventTarget {
  if (event.visitId) return { kind: 'visit', visitId: event.visitId }
  if (event.locationHidden) return { kind: 'hidden' }
  const at = event.pointRecordedAt ?? null
  return { kind: 'map', userId: event.userId, day: localDay(at ?? event.createdAt), at }
}

/** Events a reviewer can still acknowledge (confirmed and dismissed ones keep their verdict). */
export const canAcknowledge = (event: Pick<IntegrityEventDto, 'status'>): boolean =>
  event.status === 'open' || event.status === 'acknowledged'
