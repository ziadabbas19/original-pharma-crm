import { getRouteApi } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrackingMonitorGetHistory, useTrackingMonitorGetPresence } from '@/api/generated/endpoints'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState, Spinner } from '@/components/states'
import { Card } from '@/components/ui/card'
import { usePermission } from '@/features/auth/usePermission'
import { useNow } from '@/hooks/use-now'
import { fromDateInputValue, toDateInputValue } from '@/lib/format'
import { distanceMeters } from '@/lib/geo'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { liveLocationsSelectors, repWatched } from '@/store/slices/liveLocationsSlice'
import { LIVE_STATUS_DOT, LIVE_STATUSES, liveStatusOf, type LiveStatus } from '../live-status'
import { useLiveView } from '../useLiveView'
import { RepDetailPanel, type RouteSummary } from './RepDetailPanel'
import { RepList, type LiveRepView } from './RepList'
import { RepMap, type MapRep, type RoutePoint } from './RepMap'

const route = getRouteApi('/admin/live-map')
const DAY_MS = 86_400_000

function today(): string {
  return toDateInputValue(new Date())
}

/**
 * Live positions of the reps in the user's scope. Data comes from the
 * liveLocations store, which the admin layout keeps current (presence snapshot
 * plus SignalR). Selecting a rep opens its panel and follows it on the map;
 * dragging the map stops following.
 */
export function LiveMapPage() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = route.useNavigate()
  const { rep: selectedId = null } = route.useSearch()
  const now = useNow(30_000)

  // Same query the layout polls; read here for its loading and error state.
  const presence = useTrackingMonitorGetPresence({ query: { staleTime: 15_000 } })
  const reps = useAppSelector((s) => liveLocationsSelectors.selectAll(s.liveLocations))
  const watched = useAppSelector((s) => s.liveLocations.watchedRepId)
  const canViewHistory = usePermission(P.tracking.history)
  const canReviewFlags = usePermission(P.tracking.reviewFlags)

  const [following, setFollowing] = useState(selectedId !== null)
  const [day, setDay] = useState(today)
  const [fitCount, setFitCount] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LiveStatus | null>(null)

  // Live view lease (faster reporting from the rep's phone) while toggled on.
  useLiveView(watched)
  useEffect(() => () => void dispatch(repWatched(null)), [dispatch])

  const views = useMemo<LiveRepView[]>(
    () => reps.map((r) => ({ ...r, liveStatus: liveStatusOf(r, now) })),
    [reps, now],
  )
  const mapReps = useMemo<MapRep[]>(
    () =>
      views
        .filter((r) => !statusFilter || r.liveStatus === statusFilter || r.userId === selectedId)
        .map((r) => ({ userId: r.userId, fullName: r.fullName, status: r.liveStatus, position: r.position })),
    [views, statusFilter, selectedId],
  )
  const selected = views.find((r) => r.userId === selectedId) ?? null

  const select = useCallback(
    (userId: string | null) => {
      void navigate({ search: userId ? { rep: userId } : {}, replace: true })
      setFollowing(userId !== null)
      setDay(today())
      setFitCount(0)
      if (watched && watched !== userId) dispatch(repWatched(null))
    },
    [navigate, watched, dispatch],
  )
  const stopFollowing = useCallback(() => setFollowing(false), [])

  // The day's route of the selected rep.
  const maxDay = toDateInputValue(new Date(now))
  const isToday = day === maxDay
  const from = fromDateInputValue(day)
  const history = useTrackingMonitorGetHistory(
    selectedId ?? '',
    { from: from.toISOString(), to: new Date(from.getTime() + DAY_MS).toISOString() },
    { query: { enabled: selectedId !== null && canViewHistory, refetchInterval: isToday ? 60_000 : false } },
  )

  const livePosition = selected?.position ?? null
  const routePoints = useMemo<RoutePoint[] | null>(() => {
    if (!selectedId || !history.data) return null
    const points: RoutePoint[] = history.data.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      recordedAt: p.recordedAt,
      flagged: p.isMock || p.anomalyScore >= 50,
    }))
    // Between history refreshes, extend today's route with the latest live fix.
    const last = points.at(-1)
    if (
      isToday &&
      livePosition &&
      (!last || new Date(livePosition.recordedAt).getTime() > new Date(last.recordedAt).getTime())
    ) {
      points.push({
        lat: livePosition.lat,
        lng: livePosition.lng,
        recordedAt: livePosition.recordedAt,
        flagged: livePosition.isMock || livePosition.anomalyScore >= 50,
      })
    }
    return points
  }, [selectedId, history.data, isToday, livePosition])

  const summary = useMemo<RouteSummary | null>(() => {
    if (!routePoints || routePoints.length === 0) return null
    let meters = 0
    for (let i = 1; i < routePoints.length; i++) {
      const a = routePoints[i - 1]
      const b = routePoints[i]
      meters += distanceMeters(a.lat, a.lng, b.lat, b.lng)
    }
    return {
      points: routePoints.length,
      distanceMeters: meters,
      firstAt: routePoints[0].recordedAt,
      lastAt: routePoints[routePoints.length - 1].recordedAt,
      flagged: routePoints.filter((p) => p.flagged).length,
    }
  }, [routePoints])

  // Past days are framed when loaded; today only on request (the map follows the rep instead).
  const fitRouteKey =
    selectedId && routePoints && routePoints.length > 0 && (!isToday || fitCount > 0)
      ? `${selectedId}|${day}|${fitCount}`
      : ''

  const firstLoad = presence.isLoading && reps.length === 0

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
      <PageHeader className="mb-0" title={t('liveMap.title')} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="relative h-[55dvh] min-h-80 overflow-hidden p-0 lg:h-auto">
          <RepMap
            reps={mapReps}
            selectedId={selectedId}
            following={following}
            route={routePoints}
            fitRouteKey={fitRouteKey}
            onSelect={select}
            onUserPan={stopFollowing}
          />
          <div className="pointer-events-none absolute inset-s-2 top-2 z-10 flex flex-col gap-1 rounded-md bg-card/90 px-2.5 py-2 text-xs shadow">
            {LIVE_STATUSES.map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-full ring-2 ring-card', LIVE_STATUS_DOT[status])} />
                {t(`liveMap.status.${status}`)}
              </span>
            ))}
          </div>
        </Card>

        <Card className="flex max-h-[75dvh] min-h-80 flex-col gap-0 overflow-hidden p-0 lg:max-h-none">
          {presence.error && reps.length === 0 ? (
            <div className="p-3">
              <ErrorState error={presence.error} onRetry={() => void presence.refetch()} />
            </div>
          ) : firstLoad ? (
            <Spinner />
          ) : selected ? (
            <RepDetailPanel
              rep={selected}
              now={now}
              following={following}
              onFollow={() => setFollowing(true)}
              liveViewOn={watched === selected.userId}
              onToggleLiveView={() =>
                dispatch(repWatched(watched === selected.userId ? null : selected.userId))
              }
              onBack={() => select(null)}
              canViewHistory={canViewHistory}
              canReviewFlags={canReviewFlags}
              day={day}
              maxDay={maxDay}
              onDayChange={(value) => {
                setDay(value)
                setFitCount(0)
                if (value !== maxDay) setFollowing(false)
              }}
              history={{
                isLoading: history.isLoading,
                error: history.error,
                refetch: () => void history.refetch(),
              }}
              summary={summary}
              onFitRoute={() => {
                setFollowing(false)
                setFitCount((c) => c + 1)
              }}
            />
          ) : (
            <RepList
              reps={views}
              now={now}
              selectedId={selectedId}
              onSelect={select}
              search={search}
              onSearch={setSearch}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
            />
          )}
        </Card>
      </div>
    </div>
  )
}
