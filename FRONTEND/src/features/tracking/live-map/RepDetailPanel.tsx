import { Link } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  CrosshairIcon,
  FlagIcon,
  LocateFixedIcon,
  MaximizeIcon,
  RadioIcon,
  RouteIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '@/components/UserAvatar'
import { EmptyState, ErrorState, Spinner } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDistance, formatNumber, formatRelative, formatTime } from '@/lib/format'
import { LiveStatusBadge } from '../LiveStatusBadge'
import type { LiveRepView } from './RepList'

export interface RouteSummary {
  points: number
  distanceMeters: number
  firstAt: string
  lastAt: string
  flagged: number
}

export function RepDetailPanel({
  rep,
  now,
  following,
  onFollow,
  liveViewOn,
  onToggleLiveView,
  onBack,
  canViewHistory,
  canReviewFlags,
  day,
  maxDay,
  onDayChange,
  history,
  summary,
  onFitRoute,
}: {
  rep: LiveRepView
  now: number
  following: boolean
  onFollow: () => void
  liveViewOn: boolean
  onToggleLiveView: () => void
  onBack: () => void
  canViewHistory: boolean
  canReviewFlags: boolean
  day: string
  maxDay: string
  onDayChange: (day: string) => void
  history: { isLoading: boolean; error: unknown; refetch: () => void }
  summary: RouteSummary | null
  onFitRoute: () => void
}) {
  const { t } = useTranslation()
  const position = rep.position

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onBack}
          aria-label={t('liveMap.backToList')}
        >
          <ArrowLeftIcon className="rtl:rotate-180" />
        </Button>
        <UserAvatar name={rep.fullName} src={rep.avatarUrl} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{rep.fullName}</div>
          <div className="text-xs text-muted-foreground">
            {t('liveMap.lastSeen', { time: formatRelative(rep.lastSeenAt, now) ?? t('liveMap.never') })}
          </div>
        </div>
        <LiveStatusBadge status={rep.liveStatus} />
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={following ? 'secondary' : 'outline'}
            onClick={onFollow}
            disabled={!position}
            aria-pressed={following}
          >
            {following ? <LocateFixedIcon /> : <CrosshairIcon />}
            {following ? t('liveMap.following') : t('liveMap.follow')}
          </Button>
          <Button
            size="sm"
            variant={liveViewOn ? 'secondary' : 'outline'}
            onClick={onToggleLiveView}
            disabled={rep.liveStatus === 'offShift'}
            aria-pressed={liveViewOn}
            title={t('liveMap.liveViewHint')}
          >
            <RadioIcon className={liveViewOn ? 'animate-pulse text-success' : undefined} />
            {liveViewOn ? t('liveMap.stopLiveView') : t('liveMap.liveView')}
          </Button>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Stat label={t('liveMap.position')}>
            {position ? (
              <span dir="ltr" className="font-mono text-xs">
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              </span>
            ) : (
              t('liveMap.noPosition')
            )}
          </Stat>
          <Stat label={t('liveMap.recordedAt')}>{position ? formatTime(position.recordedAt) : '—'}</Stat>
          <Stat label={t('liveMap.accuracyLabel')}>{position ? formatDistance(position.accuracy) : '—'}</Stat>
          <Stat label={t('liveMap.speed')}>
            {position?.speed != null ? t('liveMap.kmh', { value: formatNumber(position.speed * 3.6) }) : '—'}
          </Stat>
          <Stat label={t('liveMap.batteryLabel')}>
            {position?.batteryLevel != null ? `${formatNumber(position.batteryLevel * 100)}%` : '—'}
          </Stat>
          <Stat label={t('liveMap.source')}>{position ? t(`devices.sources.${position.source}`) : '—'}</Stat>
        </dl>

        {(position?.isMock || (position && position.anomalyScore > 0)) && (
          <div className="flex flex-wrap gap-1.5">
            {position.isMock && <Badge variant="destructive">{t('liveMap.mock')}</Badge>}
            {position.anomalyScore > 0 && (
              <Badge variant={position.anomalyScore >= 50 ? 'destructive' : 'warning'}>
                {t('liveMap.anomalyScore', { score: position.anomalyScore })}
              </Badge>
            )}
          </div>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
            {t('liveMap.deviceHealth')}
          </h3>
          {rep.deviceHealthy ? (
            <Badge variant="success">{t('devices.healthy')}</Badge>
          ) : (
            <ul className="space-y-1 text-sm">
              {rep.healthIssues.map((issue) => (
                <li key={issue} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                  {t(`health.issues.${issue}`, { defaultValue: issue })}
                </li>
              ))}
            </ul>
          )}
          {rep.openFlags > 0 &&
            (canReviewFlags ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/flags" search={{ userId: rep.userId, status: 'open' }}>
                  <FlagIcon />
                  {t('devices.reviewFlags', { count: rep.openFlags })}
                </Link>
              </Button>
            ) : (
              <Badge variant="destructive">{t('liveMap.flags', { count: rep.openFlags })}</Badge>
            ))}
        </section>

        {canViewHistory && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
                <RouteIcon className="size-3.5" />
                {t('liveMap.route')}
              </h3>
              <Input
                type="date"
                className="h-8 w-40 text-sm"
                value={day}
                max={maxDay}
                onChange={(e) => e.target.value && onDayChange(e.target.value)}
                aria-label={t('liveMap.routeDay')}
              />
            </div>
            {history.error ? (
              <ErrorState error={history.error} onRetry={history.refetch} />
            ) : history.isLoading ? (
              <Spinner className="py-4" />
            ) : !summary ? (
              <EmptyState icon={RouteIcon} title={t('liveMap.noRoute')} className="py-4" />
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Stat label={t('liveMap.routeDistance')}>{formatDistance(summary.distanceMeters)}</Stat>
                  <Stat label={t('liveMap.routePoints')}>{formatNumber(summary.points)}</Stat>
                  <Stat label={t('liveMap.routeStart')}>{formatTime(summary.firstAt)}</Stat>
                  <Stat label={t('liveMap.routeEnd')}>{formatTime(summary.lastAt)}</Stat>
                </dl>
                {summary.flagged > 0 && (
                  <p className="text-xs text-destructive">
                    {t('liveMap.routeFlagged', { count: summary.flagged })}
                  </p>
                )}
                <Button size="sm" variant="outline" onClick={onFitRoute}>
                  <MaximizeIcon />
                  {t('liveMap.fitRoute')}
                </Button>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}
