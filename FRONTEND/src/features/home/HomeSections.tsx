import { Link } from '@tanstack/react-router'
import {
  BellIcon,
  CalendarRangeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  StethoscopeIcon,
  TargetIcon,
  TimerIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotificationsList } from '@/api/generated/endpoints'
import { EmptyState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePermission } from '@/features/auth/usePermission'
import { notificationText } from '@/features/notifications/notification-text'
import { CheckInSheet } from '@/features/visits/CheckInSheet'
import { useRepCustomers } from '@/features/visits/use-rep-customers'
import { formatNumber, formatRelative, formatTime, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { progressShare, type SectionKey } from '../settings/rep-home-config'
import type { PlanItem, TodayPlan } from './today-plan'

/** Renders one configured Home block. */
export function HomeSection({
  section,
  plan,
  target,
  index,
}: {
  section: SectionKey
  plan: TodayPlan
  target: number
  /** Position on the screen, for the short staggered entrance. */
  index: number
}) {
  const style = { '--i': index } as CSSProperties
  const content = (() => {
    switch (section) {
      case 'todayProgress':
        return <TodayProgressCard done={plan.done} target={target} inProgress={plan.inProgress} />
      case 'upcomingVisits':
        return <UpcomingVisits items={plan.items} />
      case 'startNextVisit':
        return <StartNextVisit plan={plan} />
      case 'weeklySummary':
        return <NotYetCard section={section} icon={CalendarRangeIcon} />
      case 'targetsAndSales':
        return <NotYetCard section={section} icon={TargetIcon} />
      case 'managerAlerts':
        return <ManagerAlerts />
    }
  })()
  return (
    <div className="animate-fade-up" style={style} data-section={section}>
      {content}
    </div>
  )
}

/** A ring that fills from empty to the share of today's target on first render (CSS only). */
export function ProgressRing({
  value,
  children,
  className,
}: {
  /** 0 to 1. */
  value: number
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'progress-ring relative grid size-24 shrink-0 place-items-center rounded-full',
        className,
      )}
      style={{ '--ring-target': Math.round(value * 100) } as CSSProperties}
      role="img"
      aria-hidden
    >
      <div className="grid size-[76%] place-items-center rounded-full bg-card">{children}</div>
    </div>
  )
}

function TodayProgressCard({
  done,
  target,
  inProgress,
}: {
  done: number
  target: number
  inProgress: boolean
}) {
  const { t } = useTranslation()
  return (
    <Card className="py-4 shadow-md" data-testid="home-progress">
      <CardContent className="flex items-center gap-4 px-5">
        <ProgressRing value={progressShare(done, target)}>
          <span className="text-xl font-bold tabular-nums" dir="ltr">
            {formatNumber(done)} / {formatNumber(target)}
          </span>
        </ProgressRing>
        <div className="grid min-w-0 gap-1">
          <p className="text-section font-bold">{t('repHome.progress.title')}</p>
          <p className="text-sm text-muted-foreground">
            {t('repHome.progress.summary', { done: formatNumber(done), target: formatNumber(target) })}
          </p>
          {inProgress && (
            <Badge className="mt-1">
              <TimerIcon aria-hidden />
              {t('repHome.status.inProgress')}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const PILL: Record<PlanItem['kind'], 'default' | 'success' | 'secondary'> = {
  inProgress: 'default',
  waiting: 'secondary',
  done: 'success',
}

function UpcomingVisits({ items }: { items: PlanItem[] }) {
  const { t, i18n } = useTranslation()
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeftIcon : ChevronRightIcon
  return (
    <section className="grid gap-2" aria-labelledby="home-upcoming" data-testid="home-upcoming">
      <h2 id="home-upcoming" className="px-1 text-section font-bold">
        {t('repHome.sections.upcomingVisits')}
      </h2>
      {items.length === 0 ? (
        <Card className="py-2">
          <EmptyState icon={StethoscopeIcon} title={t('repHome.upcoming.empty')} className="py-6" />
        </Card>
      ) : (
        <ul className="grid gap-2">
          {items.map((item, index) => (
            <li
              key={`${item.kind}-${item.customerId}-${item.at ?? ''}`}
              className="animate-fade-up"
              style={{ '--i': index } as CSSProperties}
            >
              <Link
                to="/rep/customers/$customerId"
                params={{ customerId: item.customerId }}
                className="flex items-center gap-3 rounded-card border bg-card p-3 shadow-card transition-colors hover:bg-accent/60 active:scale-[0.99]"
              >
                <span
                  className={cn(
                    'grid size-12 shrink-0 place-items-center rounded-control text-sm font-bold tabular-nums',
                    item.kind === 'done'
                      ? 'bg-success-soft text-success'
                      : 'bg-primary-soft text-primary-soft-foreground',
                  )}
                  dir="ltr"
                >
                  {item.at ? formatTime(item.at) : <StethoscopeIcon className="size-5" aria-hidden />}
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-semibold">{localizedName(item.name, item.nameAr)}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {localizedName(item.townName, item.townNameAr) || '—'}
                  </span>
                </span>
                <Badge variant={PILL[item.kind]}>{t(`repHome.status.${item.kind}`)}</Badge>
                <Chevron className="size-4 shrink-0 text-icon" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StartNextVisit({ plan }: { plan: TodayPlan }) {
  const { t } = useTranslation()
  const allowed = usePermission(P.visits.create)
  const shift = useAppSelector((s) => s.tracking.shift)
  const { customers } = useRepCustomers()
  const [open, setOpen] = useState(false)
  if (!allowed) return null

  if (plan.inProgress) {
    return (
      <Button asChild size="xl" className="w-full" data-testid="home-continue-visit">
        <Link to="/rep/visits/active">
          <TimerIcon />
          {t('visits.continue')}
        </Link>
      </Button>
    )
  }

  const next = plan.next ? customers.find((c) => c.id === plan.next?.id) : undefined
  const waiting = Boolean(shift && next)
  return (
    <div className="grid gap-1.5">
      <Button
        size="xl"
        className={cn('w-full', waiting && 'animate-attention')}
        disabled={!waiting}
        onClick={() => setOpen(true)}
        data-testid="home-start-next"
        data-waiting={waiting}
      >
        <PlayIcon />
        {next
          ? t('repHome.startNext.withName', { name: localizedName(next.name, next.nameAr) })
          : t('repHome.startNext.label')}
      </Button>
      {!shift ? (
        <p className="text-center text-xs text-muted-foreground">{t('repHome.startNext.noDay')}</p>
      ) : (
        !next && (
          <p className="text-center text-xs text-muted-foreground">{t('repHome.startNext.allVisited')}</p>
        )
      )}
      {open && next && <CheckInSheet customer={next} onClose={() => setOpen(false)} />}
    </div>
  )
}

function NotYetCard({ section, icon }: { section: SectionKey; icon: LucideIcon }) {
  const { t } = useTranslation()
  return (
    <Card className="py-2" data-testid={`home-${section}`}>
      <EmptyState
        icon={icon}
        title={t(`repHome.sections.${section}`)}
        description={t('repHome.notYet')}
        className="py-6"
      />
    </Card>
  )
}

function ManagerAlerts() {
  const { t } = useTranslation()
  const alerts = useNotificationsList({ unreadOnly: true, limit: 3 }, { query: { staleTime: 30_000 } })
  const items = alerts.data ?? []
  return (
    <Card className="gap-2 py-4" data-testid="home-alerts">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-5">
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-[18px] text-primary" aria-hidden />
          {t('repHome.sections.managerAlerts')}
        </CardTitle>
        <Button asChild size="sm" variant="ghost">
          <Link to="/rep/notifications">{t('repHome.alerts.all')}</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-5">
        {items.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('repHome.alerts.empty')}</p>
        ) : (
          <ul className="grid divide-y">
            {items.map((n) => {
              const text = notificationText(n, t)
              return (
                <li key={n.id} className="grid gap-0.5 py-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{text.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </span>
                  </span>
                  {text.body && (
                    <span className="line-clamp-2 text-sm text-muted-foreground">{text.body}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
