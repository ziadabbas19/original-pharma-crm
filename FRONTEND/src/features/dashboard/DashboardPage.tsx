import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FlagIcon,
  LocateOffIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TimerIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useLocationIntegrityGetSummary,
  useTrackingMonitorGetFlags,
  useTrackingMonitorGetPresence,
  useVisitsList,
  useExpensesMonthReport,
} from '@/api/generated/endpoints'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/features/auth/usePermission'
import { FlagTypeBadge, ScoreBadge } from '@/features/flags/flag-display'
import { ReasonBadges } from '@/features/suspicious/trust-display'
import { liveStatusOf, type LiveStatus } from '@/features/tracking/live-status'
import { LiveStatusDot } from '@/features/tracking/LiveStatusBadge'
import { useNow } from '@/hooks/use-now'
import { egyptToday, monthOf } from '@/lib/egypt-day'
import { formatMoney, formatMonth, formatNumber, formatRelative } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { liveLocationsSelectors } from '@/store/slices/liveLocationsSlice'

const DAY_MS = 86_400_000
const ATTENTION_ORDER: Record<LiveStatus, number> = {
  lost: 0,
  stale: 1,
  online: 2,
  notOnVisit: 3,
  offShift: 4,
}

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
  const canReviewSuspicious = usePermission(P.tracking.reviewSuspicious)
  const canReadExpenses = usePermission(P.expenses.read)

  return (
    <>
      <PageHeader
        title={t('admin.welcome', { name: user?.fullName ?? '' })}
        description={t('admin.overviewHint')}
      />
      <div className="space-y-4">
        {canViewLive && <LiveStats canReviewFlags={canReviewFlags} canReadDevices={canReadDevices} />}
        {canReadExpenses && <MonthExpensesKpi />}
        <div className="grid stagger-children gap-4 xl:grid-cols-3">
          {canViewLive && <NeedsAttention />}
          {canReviewFlags && <LatestFlags />}
          {canReadVisits && <TodayVisits />}
          {canReviewSuspicious && <SuspiciousSummary />}
        </div>
        {!canViewLive && !canReviewFlags && !canReadVisits && !canReviewSuspicious && (
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
    const byStatus: Record<LiveStatus, number> = { online: 0, stale: 0, lost: 0, notOnVisit: 0, offShift: 0 }
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
    <div className="grid stagger-children grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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

/** This calendar month's expenses of everyone in scope, with a link to the month view. */
function MonthExpensesKpi() {
  const { t } = useTranslation()
  const month = monthOf(egyptToday())
  const report = useExpensesMonthReport({ month }, { query: { staleTime: 60_000 } })
  return (
    <Link
      to="/admin/expenses"
      search={{ view: 'month' }}
      className="block rounded-card"
      data-testid="dashboard-expenses"
    >
      <Card className="flex-row items-center gap-3 px-4 py-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
        <span className="flex size-10 items-center justify-center rounded-[12px] bg-primary-soft text-primary-soft-foreground">
          <WalletIcon className="size-5" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="text-label font-semibold text-muted-foreground">
            {t('expenses.dashboardTitle')}
          </span>
          <span className="text-xs text-muted-foreground">{formatMonth(month)}</span>
        </span>
        {report.isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <span className="text-xl font-bold tabular-nums">
            {report.data ? formatMoney(report.data.total) : '—'}
          </span>
        )}
      </Card>
    </Link>
  )
}

const TONE: Record<'success' | 'warning' | 'destructive', string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  destructive: 'bg-destructive-soft text-destructive',
}

/** The short line under a KPI value: green when all is well, amber when it needs a look. */
const TONE_LINE: Record<keyof typeof TONE, string> = {
  success: 'bg-green',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
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
        'h-full gap-2 py-4',
        to && 'transition-colors hover:border-primary/40 hover:bg-accent/40',
      )}
    >
      <CardHeader className="gap-2 px-4">
        <CardDescription className="flex items-center gap-2 text-label font-semibold">
          <span className={cn('flex size-8 items-center justify-center rounded-[10px]', TONE[tone])}>
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 leading-tight">{label}</span>
        </CardDescription>
        {loading ? (
          <Skeleton className="h-10 w-16" />
        ) : (
          <CardTitle className="text-kpi font-bold tabular-nums">{formatNumber(value)}</CardTitle>
        )}
        <span className={cn('h-1 w-10 rounded-full', TONE_LINE[tone])} aria-hidden />
      </CardHeader>
    </Card>
  )
  return to ? (
    <Link
      to={to}
      className="rounded-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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

function ViewAll({
  to,
}: {
  to: '/admin/live-map' | '/admin/flags' | '/admin/visits' | '/admin/suspicious-activity'
}) {
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

/** Suspicious location activity of the last 7 days, inside the reviewer's scope. */
function SuspiciousSummary() {
  const { t } = useTranslation()
  const summary = useLocationIntegrityGetSummary(undefined, { query: { refetchInterval: 120_000 } })
  const s = summary.data
  const figures: { label: string; value: number; tone?: string }[] = s
    ? [
        {
          label: t('suspicious.summary.openEvents'),
          value: s.openEvents,
          tone: s.openEvents > 0 ? 'text-destructive' : undefined,
        },
        { label: t('suspicious.summary.repsFlagged'), value: s.repsFlagged },
        { label: t('suspicious.summary.flaggedVisits'), value: s.flaggedVisits },
        { label: t('suspicious.summary.mockPoints'), value: s.mockPoints },
        { label: t('suspicious.summary.suspiciousPoints'), value: s.suspiciousPoints },
        { label: t('suspicious.summary.rejectedPoints'), value: s.rejectedPoints },
      ]
    : []

  return (
    <Panel title={t('suspicious.summary.title')} action={<ViewAll to="/admin/suspicious-activity" />}>
      {summary.error && !s ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : !s ? (
        <LoadingState rows={4} />
      ) : s.totalEvents === 0 && s.suspiciousPoints === 0 && s.rejectedPoints === 0 ? (
        <EmptyState icon={ShieldCheckIcon} title={t('suspicious.summary.clear')} className="py-6" />
      ) : (
        <div className="grid gap-3" data-testid="suspicious-summary">
          <dl className="grid grid-cols-2 gap-3">
            {figures.map((f) => (
              <div key={f.label} className="grid content-start gap-0.5">
                <dt className="text-xs leading-tight text-muted-foreground">{f.label}</dt>
                <dd className={cn('text-xl font-semibold tabular-nums', f.tone)}>{formatNumber(f.value)}</dd>
              </div>
            ))}
          </dl>
          {s.topReasons.length > 0 && <ReasonBadges reasons={s.topReasons.map((r) => r.reason)} max={5} />}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            {t(`suspicious.summary.policy.${s.mockPolicy}`)}
          </p>
        </div>
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
            <div key={key} className="rounded-control border p-3">
              <dt className="text-label font-semibold text-muted-foreground">
                {t(`admin.visitCounts.${key}`)}
              </dt>
              <dd className={cn('text-2xl font-bold tabular-nums', tone)}>{formatNumber(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  )
}
