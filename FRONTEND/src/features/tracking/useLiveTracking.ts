import { useEffect } from 'react'
import { useTrackingMonitorGetPresence } from '@/api/generated/endpoints'
import { usePermission } from '@/features/auth/usePermission'
import { P } from '@/lib/permissions'
import { useAppDispatch } from '@/store'
import { presenceLoaded } from '@/store/slices/liveLocationsSlice'
import { useTrackingHub } from './useTrackingHub'

/**
 * Keeps the liveLocations store current for the whole dashboard: a presence
 * snapshot (polled as a safety net) plus SignalR updates in between. Runs only
 * for users who may see live positions.
 */
export function useLiveTracking(): void {
  const canViewLive = usePermission(P.tracking.viewLive)
  const dispatch = useAppDispatch()
  const presence = useTrackingMonitorGetPresence({
    query: { enabled: canViewLive, refetchInterval: 60_000, staleTime: 15_000 },
  })

  useEffect(() => {
    if (presence.data) dispatch(presenceLoaded(presence.data))
  }, [presence.data, dispatch])

  useTrackingHub(canViewLive)
}
