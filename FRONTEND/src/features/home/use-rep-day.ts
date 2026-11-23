import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import {
  getRepDayTodayQueryKey,
  repDaySetAmPlaces,
  repDaySetArea,
  repDaySetDoctorOrder,
  useRepDayToday,
} from '@/api/generated/endpoints'
import type { RepAmPlaceInput, RepTodayDto } from '@/api/generated/model'
import { usePermission } from '@/features/auth/usePermission'
import { egyptToday } from '@/lib/egypt-day'
import { handleError } from '@/lib/errors'
import { readCache, writeCache } from '@/lib/offline-cache'
import { P } from '@/lib/permissions'

const CACHE_KEY = 'rep-day'

/** The towns the upcoming doctors are limited to: the chosen town, or none for the whole area. */
export function townFilterOf(day: Pick<RepTodayDto, 'territoryId' | 'areaId'> | undefined): string[] | null {
  if (!day?.territoryId || day.territoryId === day.areaId) return null
  return [day.territoryId]
}

/**
 * Today's choices of the rep, kept on the server per Egypt day: the area of the doctor visits, their
 * order and the AM list. The last copy stays readable offline for the same day. Changes are shown at
 * once and undone (with the error message) when the server refuses them.
 */
export function useRepDay() {
  const queryClient = useQueryClient()
  const allowed = usePermission(P.visits.create)
  const today = egyptToday()
  const copy = readCache<RepTodayDto>(CACHE_KEY)
  const cached = copy?.data.day === today ? copy.data : undefined
  const query = useRepDayToday({
    query: {
      enabled: allowed,
      initialData: cached,
      initialDataUpdatedAt: copy?.savedAt,
      staleTime: 60_000,
    },
  })
  useEffect(() => {
    if (query.data && query.isFetchedAfterMount) writeCache(CACHE_KEY, query.data)
  }, [query.data, query.isFetchedAfterMount])

  const save = useCallback(
    async (
      run: () => Promise<RepTodayDto>,
      optimistic: (day: RepTodayDto) => RepTodayDto,
      context: string,
    ): Promise<RepTodayDto | undefined> => {
      const key = getRepDayTodayQueryKey()
      const previous = queryClient.getQueryData<RepTodayDto>(key)
      if (previous) queryClient.setQueryData(key, optimistic(previous))
      try {
        const next = await run()
        queryClient.setQueryData(key, next)
        writeCache(CACHE_KEY, next)
        return next
      } catch (error) {
        if (previous) queryClient.setQueryData(key, previous)
        handleError(error, { context })
        return undefined
      }
    },
    [queryClient],
  )

  return useMemo(
    () => ({
      day: query.data,
      isLoading: query.isLoading,
      setArea: (territoryId: string | null) =>
        save(
          () => repDaySetArea({ territoryId }),
          (d) => ({ ...d, territoryId, areaChosen: true }),
          'repDay.area',
        ),
      setDoctorOrder: (customerIds: string[]) =>
        save(
          () => repDaySetDoctorOrder({ customerIds }),
          (d) => ({ ...d, doctorOrder: customerIds }),
          'repDay.order',
        ),
      setAmPlaces: (places: RepAmPlaceInput[], shown: RepTodayDto['amPlaces']) =>
        save(
          () => repDaySetAmPlaces({ places }),
          (d) => ({ ...d, amPlaces: shown.map((p, position) => ({ ...p, position })) }),
          'repDay.am',
        ),
    }),
    [query.data, query.isLoading, save],
  )
}
