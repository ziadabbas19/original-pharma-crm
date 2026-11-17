import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FlagIcon,
  LocateOffIcon,
  SmartphoneIcon,
  TimerIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useTrackingMonitorGetFlags,
  useTrackingMonitorGetPresence,
  useVisitsList,
} from '@/api/generated/endpoints'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/features/auth/usePermission'
import { FlagTypeBadge, ScoreBadge } from '@/features/flags/flag-display'
import { liveStatusOf, type LiveStatus } from '@/features/tracking/live-status'
import { LiveStatusDot } from '@/features/tracking/LiveStatusBadge'
import { useNow } from '@/hooks/use-now'
import { formatNumber, formatRelative } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { liveLocationsSelectors } from '@/store/slices/liveLocationsSlice'

const DAY_MS = 86_400_000
const ATTENTION_ORDER: Record<LiveStatus, number> = { lost: 0, stale: 1, online: 2, offShift: 3 }

function todayRange(): { from: string; to: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return { from: start.toISOString(), to: new Date(start.getTime() + DAY_MS).toISOString() }
}

export function DashboardPage() {
  const { t } = useTranslation()
  const user = useAppSelector((s) => s.auth.user)
  const canViewLive = usePermission(P.tracking.viewLive)
  const canReviewFlags = usePermission(P.tracking.reviewFlags)
  const canReadVisits = usePermission(P.visits.read)
  const canReadDevices = usePermission(P.devices.read)

  return (
    <>
      <PageHeader
        title={t('admin.welcome', { name: user?.fullName ?? '' })}
        description={t('admin.overviewHint')}
      />
      <div className="space-y-4">
        {canViewLive && <LiveStats canReviewFlags={canReviewFlags} canReadDevices={canReadDevices} />}
        <div className="grid gap-4 xl:grid-cols-3">
          {canViewLive && <NeedsAttention />}
          {canReviewFlags && <LatestFlags />}
          {canReadVisits && <TodayVisits />}
        </div>
        {!canViewLive && !canReviewFlags && !canReadVisits && (
          <Card>
            <EmptyState title={t('admin.nothingHere')} description={t('admin.nothingHereHint')} />
          </Card>
        )}
      </div>
    </>
  )
}

function LiveStats({ canReviewFlags, canReadDevices }: { canReviewFlags: boolean; canReadDevices: boolean }) {
  const { t } = useTranslation()
  const now = useNow(30_000)
  const presence = useTrackingMonitorGetPresence({ query: { staleTime: 15_000 } })
  const reps = useAppSelector((s) => liveLocationsSelectors.selectAll(s.liveLocations))
  const loading = presence.isLoading && reps.length === 0

  const counts = useMemo(() => {
    const byStatus: Record<LiveStatus, number> = { online: 0, stale: 0, lost: 0, offShift: 0 }
    for (const rep of reps) byStatus[liveStatusOf(rep, now)] += 1
    return {
      ...byStatus,
      unhealthy: reps.filter((r) => !r.deviceHealthy).length,
      flags: reps.reduce((sum, r) => sum + r.openFlags, 0),
    }
  }, [reps, now])

  if (presence.error && reps.length === 0) {
    return <ErrorState error={presence.error} onRetry={() => void presence.refetch()} />
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Stat
        icon={UsersIcon}
        tone="success"
        label={t('admin.onlineReps')}
        value={counts.online}
        loading={loading}
        to="/admin/live-map"
      />
      <Stat
        icon={TimerIcon}
        tone="warning"
        label={t('admin.staleReps')}
        value={counts.stale}
        loading={loading}
        to="/admin/live-map"
      />
      <Stat
        icon={LocateOffIcon}
        tone="destructive"
        label={t('admin.lostReps')}
        value={counts.lost}
        loading={loading}
        to="/admin/live-map"
      />
      <Stat
        icon={SmartphoneIcon}
        tone="warning"
        label={t('admin.unhealthyDevices')}
        value={counts.unhealthy}
        loading={loading}
        to={canReadDevices ? '/admin/devices' : undefined}
      />
      <Stat
        icon={FlagIcon}
        tone="destructive"
        label={t('admin.openFlags')}
        value={counts.flags}
        loading={loading}
        to={canReviewFlags ? '/admin/flags' : undefined}
      />
    </div>
  )
}

const TONE: Record<'success' | 'warning' | 'destructive', string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-foreground',
  destructive: 'bg-destructive/15 text-destructive',
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  loading,
  to,
}: {
  icon: LucideIcon
  tone: keyof typeof TONE
  label: string
  value: number
  loading: boolean
  to?: '/admin/live-map' | '/admin/devices' | '/admin/flags'
}) {
  const body = (
    <Card
      className={cn(
        'h-full gap-3 py-4',
        to && 'transition-colors hover:border-primary/40 hover:bg-accent/30',
      )}
    >
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-2">
          <span className={cn('flex size-7 items-center justify-center rounded-md', TONE[tone])}>
            <Icon className="size-4" />
          </span>
          <span className="truncate">{label}</span>
        </CardDescription>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <CardTitle className="text-3xl tabular-nums">{formatNumber(value)}</CardTitle>
        )}
      </CardHeader>
    </Card>
  )
  return to ? (
    <Link
      to={to}
      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {body}
    </Link>
  ) : (
    body
  )
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ViewAll({ to }: { to: '/admin/live-map' | '/admin/flags' | '/admin/visits' }) {
  const { t } = useTranslation()
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={to}>
        {t('admin.viewAll')}
        <ArrowRightIcon className="rtl:rotate-180" />
      </Link>
    </Button>
  )
}

function NeedsAttention() {
  const { t } = useTranslation()
  const now = useNow(30_000)
  const presence = useTrackingMonitorGetPresence({ query: { staleTime: 15_000 } })
  const reps = useAppSelector((s) => liveLocationsSelectors.selectAll(s.liveLocations))

  const items = useMemo(
    () =>
      reps
        .map((r) => ({ ...r, liveStatus: liveStatusOf(r, now) }))
        .filter(
          (r) => r.liveStatus === 'lost' || r.liveStatus === 'stale' || !r.deviceHealthy || r.openFlags > 0,
        )
        .toSorted(
          (a, b) =>
            ATTENTION_ORDER[a.liveStatus] - ATTENTION_ORDER[b.liveStatus] || b.openFlags - a.openFlags,
        )
        .slice(0, 8),
    [reps, now],
  )

  return (
    <Panel title={t('admin.needsAttention')} action={<ViewAll to="/admin/live-map" />}>
      {presence.isLoading && reps.length === 0 ? (
        <LoadingState rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={CheckCircle2Icon} title={t('admin.allClear')} className="py-6" />
      ) : (
        <ul className="-mx-2 divide-y">
          {items.map((rep) => (
            <li key={rep.userId}>
              <Link
                to="/admin/live-map"
                search={{ rep: rep.userId }}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/60"
              >
                <LiveStatusDot status={rep.liveStatus} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{rep.fullName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[
                      t(`liveMap.status.${rep.liveStatus}`),
                      !rep.deviceHealthy && t('liveMap.unhealthy'),
                      rep.openFlags > 0 && t('liveMap.flags', { count: rep.openFlags }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelative(rep.lastSeenAt, now) ?? t('liveMap.never')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function LatestFlags() {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const flags = useTrackingMonitorGetFlags({ status: 'open' }, { query: { refetchInterval: 60_000 } })
  const latest = useMemo(() => flags.data?.slice(0, 6), [flags.data])

  return (
    <Panel title={t('admin.latestFlags')} action={<ViewAll to="/admin/flags" />}>
      {flags.error && !flags.data ? (
        <ErrorState error={flags.error} onRetry={() => void flags.refetch()} />
      ) : !latest ? (
        <LoadingState rows={4} />
      ) : latest.length === 0 ? (
        <EmptyState icon={FlagIcon} title={t('flags.emptyOpen')} className="py-6" />
      ) : (
        <ul className="-mx-2 divide-y">
          {latest.map((flag) => (
            <li key={flag.id}>
              <Link
                to="/admin/flags"
                search={{ userId: flag.userId, status: 'open' }}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/60"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="truncate text-sm font-medium">{flag.userName ?? '—'}</div>
                  <FlagTypeBadge type={flag.type} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <ScoreBadge score={flag.score} />
                  <span className="text-xs text-muted-foreground">{formatRelative(flag.createdAt, now)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function TodayVisits() {
  const { t } = useTranslation()
  // Fixed for the life of the page; a long-open dashboard keeps showing the day it was opened.
  const [range] = useState(todayRange)
  const visits = useVisitsList(range, { query: { refetchInterval: 120_000 } })

  const counts = useMemo(() => {
    const list = visits.data ?? []
    return {
      total: list.length,
      completed: list.filter((v) => v.status === 'completed').length,
      inProgress: list.filter((v) => v.status === 'inProgress').length,
      review: list.filter((v) => v.needsReview).length,
    }
  }, [visits.data])

  return (
    <Panel title={t('admin.todayVisits')} action={<ViewAll to="/admin/visits" />}>
      {visits.error && !visits.data ? (
        <ErrorState error={visits.error} onRetry={() => void visits.refetch()} />
      ) : !visits.data ? (
        <LoadingState rows={2} />
      ) : counts.total === 0 ? (
        <EmptyState icon={ClipboardListIcon} title={t('admin.noVisitsToday')} className="py-6" />
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          {(
            [
              ['total', counts.total, ''],
              ['completed', counts.completed, 'text-success'],
              ['inProgress', counts.inProgress, ''],
              ['review', counts.review, counts.review > 0 ? 'text-destructive' : ''],
            ] as const
          ).map(([key, value, tone]) => (
            <div key={key} className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">{t(`admin.visitCounts.${key}`)}</dt>
              <dd className={cn('text-2xl font-semibold tabular-nums', tone)}>{formatNumber(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  )
}
