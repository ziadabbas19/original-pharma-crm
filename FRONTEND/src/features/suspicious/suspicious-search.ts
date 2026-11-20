import { TrackingFlagStatus } from '@/api/generated/model'
import { isDay, isReasonCode, type ReasonCode } from './suspicious-logic'

export type EventStatusFilter = TrackingFlagStatus | 'all'

/**
 * URL state of the review page (?from=2026-11-13&to=2026-11-19&userId=...&reason=mock-location&status=open),
 * plus the rep day that is open (?rep=...&day=...), so notifications and other pages can link to it.
 */
export interface SuspiciousSearch {
  from?: string
  to?: string
  userId?: string
  reason?: ReasonCode
  status?: EventStatusFilter
  /** Opens the events of `rep` on this local day. */
  day?: string
  rep?: string
}

const STATUS_VALUES: readonly string[] = [...Object.values(TrackingFlagStatus), 'all']

export function validateSuspiciousSearch(search: Record<string, unknown>): SuspiciousSearch {
  return {
    from: isDay(search.from) ? search.from : undefined,
    to: isDay(search.to) ? search.to : undefined,
    userId: typeof search.userId === 'string' && search.userId ? search.userId : undefined,
    reason: isReasonCode(search.reason) ? search.reason : undefined,
    status: STATUS_VALUES.includes(search.status as string)
      ? (search.status as EventStatusFilter)
      : undefined,
    day: isDay(search.day) ? search.day : undefined,
    rep: typeof search.rep === 'string' && search.rep ? search.rep : undefined,
  }
}
