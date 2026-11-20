import type { LocationVisibilityDto } from '../../api/generated/model'
import type { LiveRep } from '../../store/slices/liveLocationsSlice'

/**
 * What the map shows for a rep:
 *   online   - on shift and reporting
 *   stale    - on shift but no fix for a while (server "idle", or older than the online window)
 *   lost     - the server declared tracking lost
 *   notOnVisit - visit-only visibility: working, but not on a visit (no position is shown)
 *   offShift - not working right now
 */
export type LiveStatus = 'online' | 'stale' | 'lost' | 'notOnVisit' | 'offShift'

export const LIVE_STATUSES: LiveStatus[] = ['online', 'stale', 'lost', 'notOnVisit', 'offShift']

/** Same as Tracking:OnlineWindowMinutes in the API settings. */
export const STALE_AFTER_MS = 12 * 60_000

export function liveStatusOf(rep: Pick<LiveRep, 'status' | 'lastSeenAt'>, now: number): LiveStatus {
  switch (rep.status) {
    case 'trackingLost':
      return 'lost'
    case 'offShift':
      return 'offShift'
    case 'notOnVisit':
      return 'notOnVisit'
    case 'idle':
      return 'stale'
    default: {
      // "online" is only re-evaluated by the server on the next snapshot; age it locally meanwhile.
      const seen = rep.lastSeenAt ? new Date(rep.lastSeenAt).getTime() : 0
      return now - seen > STALE_AFTER_MS ? 'stale' : 'online'
    }
  }
}

/** Map paint colours of the brand palette (MapLibre cannot read CSS variables; see index.css). */
export const LIVE_STATUS_COLOR: Record<LiveStatus, string> = {
  online: '#9bc84e',
  stale: '#e0a030',
  lost: '#b42318',
  notOnVisit: '#97999b',
  offShift: '#97999b',
}

/** Visit-only visibility: a rep on a visit gets the brand blue pin. */
export const ON_VISIT_COLOR = '#0063ad'

export const LIVE_STATUS_DOT: Record<LiveStatus, string> = {
  online: 'bg-green',
  stale: 'bg-warning',
  lost: 'bg-destructive',
  notOnVisit: 'bg-icon',
  offShift: 'bg-muted-foreground/50',
}

export const LIVE_STATUS_BADGE: Record<LiveStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  online: 'success',
  stale: 'warning',
  lost: 'destructive',
  notOnVisit: 'secondary',
  offShift: 'secondary',
}

/** Status dot class; in visit-only mode a rep on a visit is blue, like their pin on the map. */
export function liveStatusDot(status: LiveStatus, visitOnly: boolean): string {
  return visitOnly && status === 'online' ? 'bg-primary' : LIVE_STATUS_DOT[status]
}

/** In visit-only mode "online" means "on a visit". */
export function liveStatusLabelKey(status: LiveStatus, visitOnly: boolean): string {
  return visitOnly && status === 'online' ? 'liveMap.status.onVisit' : `liveMap.status.${status}`
}

/**
 * Whether the map may show the rep's position now. The server already leaves positions out of the presence
 * snapshot outside visits; this also hides a live position once its visit ended plus the buffer, between
 * two snapshots. All-day mode shows every position.
 */
export function positionVisible(
  rep: Pick<LiveRep, 'position' | 'onVisit' | 'visibleUntil' | 'visitEndedAt'>,
  now: number,
  visibility: LocationVisibilityDto | undefined,
): boolean {
  if (!rep.position) return false
  if (!visibility || visibility.mode === 'allDay') return true
  if (rep.visibleUntil) return now <= new Date(rep.visibleUntil).getTime()
  if (rep.onVisit) return true
  if (rep.visitEndedAt) return now <= new Date(rep.visitEndedAt).getTime() + visibility.bufferMinutes * 60_000
  return false
}
