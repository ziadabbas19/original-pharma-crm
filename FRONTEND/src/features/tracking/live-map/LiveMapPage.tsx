import { getRouteApi } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeOffIcon, InfoIcon } from 'lucide-react'
import {
  useDoctorsList,
  useTrackingMonitorGetHistory,
  useTrackingMonitorGetPresence,
  useTrackingMonitorGetVisibility,
} from '@/api/generated/endpoints'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState, Spinner } from '@/components/states'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { localizedName } from '@/lib/format'
import { usePermission } from '@/features/auth/usePermission'
import { useIsPhone } from '@/hooks/use-media-query'
import { useNow } from '@/hooks/use-now'
import { fromDateInputValue, toDateInputValue } from '@/lib/format'
import { distanceMeters } from '@/lib/geo'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { liveLocationsSelectors, repWatched } from '@/store/slices/liveLocationsSlice'
import {
  LIVE_STATUSES,
  liveStatusDot,
  liveStatusLabelKey,
  liveStatusOf,
  positionVisible,
  type LiveStatus,
} from '../live-status'
import { useLiveView } from '../useLiveView'
import { RepDetailPanel, type RouteSummary } from './RepDetailPanel'
import { RepList, type LiveRepView } from './RepList'
import { RepMap, type MapDoctor, type MapRep, type RoutePoint } from './RepMap'

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
  const phone = useIsPhone()
  const dispatch = useAppDispatch()
  const navigate = route.useNavigate()
  const { rep: selectedId = null, day: linkedDay, at: linkedAt } = route.useSearch()
  const now = useNow(30_000)

  // Same query the layout polls; read here for its loading and error state.
  const presence = useTrackingMonitorGetPresence({ query: { staleTime: 15_000 } })
  const visibility = useTrackingMonitorGetVisibility({ query: { staleTime: 60_000 } })
  const visitOnly = visibility.data?.mode === 'visitOnly'
  const reps = useAppSelector((s) => liveLocationsSelectors.selectAll(s.liveLocations))
  const watched = useAppSelector((s) => s.liveLocations.watchedRepId)
  const canViewHistory = usePermission(P.tracking.history)
  const canReviewFlags = usePermission(P.tracking.reviewFlags)
  const canReadDoctors = usePermission(P.customers.read)
  const [showDoctors, setShowDoctors] = useState(false)
  const doctorList = useDoctorsList(undefined, {
    query: { enabled: showDoctors && canReadDoctors, staleTime: 5 * 60_000 },
  })
  const doctors = useMemo<MapDoctor[]>(
    () =>
      showDoctors
        ? (doctorList.data ?? []).flatMap((d) =>
            d.lat != null && d.lng != null
              ? [{ id: d.id, name: localizedName(d.name, d.nameAr), lat: d.lat, lng: d.lng }]
              : [],
          )
        : [],
    [showDoctors, doctorList.data],
  )

  // A link to a past day or a point shows that route instead of following the rep live.
  const [following, setFollowing] = useState(selectedId !== null && !linkedDay && !linkedAt)
  const [day, setDay] = useState(() => linkedDay ?? today())
  const [fitCount, setFitCount] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LiveStatus | null>(null)

  // Live view lease (faster reporting from the rep's phone) while toggled on.
  useLiveView(watched)
  useEffect(() => () => void dispatch(repWatched(null)), [dispatch])

  // Visit-only: a position is only shown during a visit and for the buffer after it.
  const views = useMemo<LiveRepView[]>(
    () =>
      reps.map((r) => ({
        ...r,
        position: positionVisible(r, now, visibility.data) ? r.position : null,
        liveStatus: liveStatusOf(r, now),
      })),
    [reps, now, visibility.data],
  )
  const mapReps = useMemo<MapRep[]>(
    () =>
      views
        .filter((r) => !statusFilter || r.liveStatus === statusFilter || r.userId === selectedId)
        .map((r) => ({
          userId: r.userId,
          fullName: r.fullName,
          status: r.liveStatus,
          position: r.position,
          visitCustomer:
            visitOnly && r.onVisit ? localizedName(r.visitCustomerName, r.visitCustomerNameAr) || null : null,
        })),
    [views, statusFilter, selectedId, visitOnly],
  )
  const nobodyOnVisit = visitOnly && reps.length > 0 && !views.some((r) => r.position)
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
    const focusAt = linkedAt ? new Date(linkedAt).getTime() : null
    const points: RoutePoint[] = history.data.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      recordedAt: p.recordedAt,
      flagged: p.isMock || p.anomalyScore >= 50 || (p.trustStatus != null && p.trustStatus !== 'trusted'),
      excluded: p.excluded === true,
      focus: focusAt !== null && Math.abs(new Date(p.recordedAt).getTime() - focusAt) < 1000,
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
        flagged:
          livePosition.isMock ||
          livePosition.anomalyScore >= 50 ||
          (livePosition.trustStatus != null && livePosition.trustStatus !== 'trusted'),
        excluded: livePosition.trustStatus === 'rejected',
      })
    }
    return points
  }, [selectedId, history.data, isToday, livePosition, linkedAt])

  const summary = useMemo<RouteSummary | null>(() => {
    if (!routePoints || routePoints.length === 0) return null
    // Same rule as the statistics: points left out of the distance are skipped, not bridged to.
    const counted = routePoints.filter((p) => !p.excluded)
    let meters = 0
    for (let i = 1; i < counted.length; i++) {
      const a = counted[i - 1]
      const b = counted[i]
      meters += distanceMeters(a.lat, a.lng, b.lat, b.lng)
    }
    return {
      points: routePoints.length,
      distanceMeters: meters,
      firstAt: routePoints[0].recordedAt,
      lastAt: routePoints[routePoints.length - 1].recordedAt,
      flagged: routePoints.filter((p) => p.flagged || p.excluded).length,
      excluded: routePoints.length - counted.length,
    }
  }, [routePoints])

  // Past days are framed when loaded; today only on request (the map follows the rep instead).
  const fitRouteKey =
    selectedId && routePoints && routePoints.length > 0 && (!isToday || fitCount > 0)
      ? `${selectedId}|${day}|${fitCount}`
      : ''

  const firstLoad = presence.isLoading && reps.length === 0

  const detail = selected ? (
    <RepDetailPanel
      rep={selected}
      now={now}
      following={following}
      onFollow={() => setFollowing(true)}
      liveViewOn={watched === selected.userId}
      onToggleLiveView={() => dispatch(repWatched(watched === selected.userId ? null : selected.userId))}
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
      visitOnly={visitOnly}
      onFitRoute={() => {
        setFollowing(false)
        setFitCount((c) => c + 1)
      }}
    />
  ) : null

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
      <PageHeader className="mb-0" title={t('liveMap.title')} />
      {visibility.data && (
        <Alert variant={visitOnly ? 'info' : 'default'} className="py-2" data-testid="visibility-banner">
          <InfoIcon />
          <AlertDescription>
            {visitOnly
              ? t('liveMap.visibility.visitOnly', { minutes: visibility.data.bufferMinutes })
              : t('liveMap.visibility.allDay')}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="relative h-[55dvh] min-h-80 overflow-hidden p-0 lg:h-auto">
          <RepMap
            reps={mapReps}
            doctors={doctors}
            selectedId={selectedId}
            following={following}
            route={routePoints}
            fitRouteKey={fitRouteKey}
            onSelect={select}
            onUserPan={stopFollowing}
          />
          {nobodyOnVisit && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-6 z-10 mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-full bg-card/95 px-4 py-2 text-sm font-medium shadow-card"
              role="status"
              data-testid="no-rep-on-visit"
            >
              <EyeOffIcon className="size-4 text-icon" aria-hidden />
              {t('liveMap.noRepOnVisit')}
            </div>
          )}
          <div className="pointer-events-none absolute inset-s-2 top-2 z-10 flex flex-col gap-1 rounded-control bg-card/90 px-2.5 py-2 text-xs shadow">
            {LIVE_STATUSES.filter((status) => visitOnly || status !== 'notOnVisit').map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span
                  className={cn('size-2.5 rounded-full ring-2 ring-card', liveStatusDot(status, visitOnly))}
                />
                {t(liveStatusLabelKey(status, visitOnly))}
              </span>
            ))}
            {canReadDoctors && (
              <label className="pointer-events-auto mt-1 flex cursor-pointer items-center gap-1.5 border-t pt-1.5">
                <Checkbox
                  checked={showDoctors}
                  onCheckedChange={(value) => setShowDoctors(value === true)}
                  data-testid="live-map-doctors"
                />
                <span className="size-2.5 rounded-full bg-success ring-2 ring-card" aria-hidden />
                {t('liveMap.showDoctors')}
                {showDoctors && doctorList.data && (
                  <span className="text-muted-foreground tabular-nums">({doctors.length})</span>
                )}
              </label>
            )}
          </div>
        </Card>

        <Card className="flex max-h-[75dvh] min-h-80 flex-col gap-0 overflow-hidden p-0 lg:max-h-none">
          {presence.error && reps.length === 0 ? (
            <div className="p-3">
              <ErrorState error={presence.error} onRetry={() => void presence.refetch()} />
            </div>
          ) : firstLoad ? (
            <Spinner />
          ) : selected && !phone ? (
            detail
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
              visitOnly={visitOnly}
            />
          )}
        </Card>
      </div>

      {/* Phones: the map keeps the full width; the selected rep's details slide up over its lower part. */}
      {phone && (
        <Sheet open={!!selected} onOpenChange={(open) => !open && select(null)} modal={false}>
          <SheetContent
            side="bottom"
            className="max-h-[55dvh] gap-0 overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
            data-testid="rep-detail-sheet"
          >
            <SheetTitle className="sr-only">{selected?.fullName ?? t('liveMap.title')}</SheetTitle>
            <SheetDescription className="sr-only">{t('liveMap.title')}</SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
