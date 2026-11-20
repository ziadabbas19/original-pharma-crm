import { useEffect, useMemo } from 'react'
import { useVisitsList } from '@/api/generated/endpoints'
import type { VisitListItemDto } from '@/api/generated/model'
import { useActiveVisit } from '@/features/visits/active-visit'
import { useRepCustomers } from '@/features/visits/use-rep-customers'
import { readCache, writeCache } from '@/lib/offline-cache'
import { todayPlan, type TodayPlan } from './today-plan'

const DAY_MS = 86_400_000
const TODAY_CACHE = 'today-visits'

function todayRange(): { from: string; to: string; day: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + DAY_MS).toISOString(),
    day: start.toDateString(),
  }
}

/** Today's visits and the doctors still to see, also offline once loaded today. */
export function useTodayPlan(): TodayPlan {
  const { customers } = useRepCustomers()
  const { visit: active } = useActiveVisit()
  const range = useMemo(() => todayRange(), [])
  const copy = readCache<{ day: string; visits: VisitListItemDto[] }>(TODAY_CACHE)
  const cached = copy?.data.day === range.day ? copy.data.visits : undefined
  const visits = useVisitsList(
    { mine: true, from: range.from, to: range.to },
    { query: { initialData: cached, initialDataUpdatedAt: copy?.savedAt, staleTime: 30_000 } },
  )
  useEffect(() => {
    if (visits.data && visits.isFetchedAfterMount) {
      writeCache(TODAY_CACHE, { day: range.day, visits: visits.data })
    }
  }, [visits.data, visits.isFetchedAfterMount, range.day])

  return useMemo(
    () =>
      todayPlan({
        visits: visits.data ?? [],
        customers,
        activeCustomerId: active?.customer.id ?? null,
      }),
    [visits.data, customers, active?.customer.id],
  )
}
