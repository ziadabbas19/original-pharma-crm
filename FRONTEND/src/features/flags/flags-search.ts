import { TrackingFlagType, type TrackingFlagStatus } from '@/api/generated/model'

export type FlagStatusFilter = TrackingFlagStatus | 'all'

/** URL state of the flags page (?status=open&type=mockLocation&userId=...), so other pages can link to a filtered view. */
export interface FlagsSearch {
  status?: FlagStatusFilter
  type?: TrackingFlagType
  userId?: string
}

const STATUS_VALUES: readonly string[] = ['open', 'confirmed', 'dismissed', 'all']
const TYPE_VALUES: readonly string[] = Object.values(TrackingFlagType)

export function validateFlagsSearch(search: Record<string, unknown>): FlagsSearch {
  return {
    status: STATUS_VALUES.includes(search.status as string) ? (search.status as FlagStatusFilter) : undefined,
    type: TYPE_VALUES.includes(search.type as string) ? (search.type as TrackingFlagType) : undefined,
    userId: typeof search.userId === 'string' && search.userId ? search.userId : undefined,
  }
}

export const FLAG_TYPES = Object.values(TrackingFlagType)
