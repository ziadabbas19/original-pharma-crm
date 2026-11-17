import type { LiveRep } from '@/store/slices/liveLocationsSlice'

/**
 * What the map shows for a rep:
 *   online   - on shift and reporting
 *   stale    - on shift but no fix for a while (server "idle", or older than the online window)
 *   lost     - the server declared tracking lost
 *   offShift - not working right now
 */
export type LiveStatus = 'online' | 'stale' | 'lost' | 'offShift'

export const LIVE_STATUSES: LiveStatus[] = ['online', 'stale', 'lost', 'offShift']

/** Same as Tracking:OnlineWindowMinutes in the API settings. */
export const STALE_AFTER_MS = 12 * 60_000

export function liveStatusOf(rep: Pick<LiveRep, 'status' | 'lastSeenAt'>, now: number): LiveStatus {
  switch (rep.status) {
    case 'trackingLost':
      return 'lost'
    case 'offShift':
      return 'offShift'
    case 'idle':
      return 'stale'
    default: {
      // "online" is only re-evaluated by the server on the next snapshot; age it locally meanwhile.
      const seen = rep.lastSeenAt ? new Date(rep.lastSeenAt).getTime() : 0
      return now - seen > STALE_AFTER_MS ? 'stale' : 'online'
    }
  }
}

/** Map paint colors (MapLibre cannot read CSS variables). */
export const LIVE_STATUS_COLOR: Record<LiveStatus, string> = {
  online: '#16a34a',
  stale: '#d97706',
  lost: '#dc2626',
  offShift: '#94a3b8',
}

export const LIVE_STATUS_DOT: Record<LiveStatus, string> = {
  online: 'bg-success',
  stale: 'bg-warning',
  lost: 'bg-destructive',
  offShift: 'bg-muted-foreground/50',
}

export const LIVE_STATUS_BADGE: Record<LiveStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  online: 'success',
  stale: 'warning',
  lost: 'destructive',
  offShift: 'secondary',
}
