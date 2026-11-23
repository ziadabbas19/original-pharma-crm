import {
  ArrowRightIcon,
  BuildingIcon,
  CheckCircle2Icon,
  CircleIcon,
  HistoryIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PencilIcon,
  PlusIcon,
  StethoscopeIcon,
  StickyNoteIcon,
  TargetIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type {
  WeeklyPlanDayDto,
  WeeklyPlanDayProgressDto,
  WeeklyPlanDto,
  WeeklyPlanEventDto,
  WeeklyPlanStatus,
} from '@/api/generated/model'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DayKey } from '@/lib/egypt-day'
import { formatDateTime, formatDayShort, formatNumber, localizedName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { barPercent, dayState, showsActuals, type DayState } from './plan-progress'

const STATUS_VARIANT: Record<WeeklyPlanStatus, 'secondary' | 'default' | 'success' | 'warning'> = {
  draft: 'secondary',
  submitted: 'default',
  approved: 'success',
  returned: 'warning',
}

export function PlanStatusBadge({ status, className }: { status: WeeklyPlanStatus; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className} data-testid="plan-status">
      {t(`plans.status.${status}`)}
    </Badge>
  )
}

/** The reviewer's note: a clear warning when the plan came back, a quiet note on an approval. */
export function ReviewNote({ plan }: { plan: WeeklyPlanDto }) {
  const { t } = useTranslation()
  if (plan.status === 'returned') {
    return (
      <Alert variant="warning" data-testid="plan-review-note">
        <MessageSquareTextIcon />
        <AlertTitle>
          {plan.reviewedByName
            ? t('plans.returnedBy', { name: plan.reviewedByName })
            : t('plans.returnedTitle')}
        </AlertTitle>
        <AlertDescription>
          <p className="whitespace-pre-line">{plan.reviewNote ?? t('plans.returnedNoNote')}</p>
        </AlertDescription>
      </Alert>
    )
  }
  if (plan.status === 'approved') {
    return (
      <Alert variant="success" data-testid="plan-review-note">
        <CheckCircle2Icon />
        <AlertTitle>
          {plan.reviewedByName
            ? t('plans.approvedBy', { name: plan.reviewedByName })
            : t('plans.status.approved')}
        </AlertTitle>
        {plan.reviewNote && (
          <AlertDescription>
            <p className="whitespace-pre-line">{plan.reviewNote}</p>
          </AlertDescription>
        )}
      </Alert>
    )
  }
  return null
}

/** A thin bar for done against target. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-muted', className)} aria-hidden>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          value >= 100 ? 'bg-green' : 'bg-primary',
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

/** The week: planned against done, the percentage and the visits outside the plan. */
export function WeekProgressCard({ plan }: { plan: WeeklyPlanDto }) {
  const { t } = useTranslation()
  const { planned, done, unplanned, percent } = plan.progress
  return (
    <Card className="gap-2 py-4" data-testid="plan-week-progress">
      <CardContent className="grid gap-3 px-4">
        <div className="flex items-end justify-between gap-3">
          <div className="grid min-w-0 gap-0.5">
            <span className="text-label font-semibold text-muted-foreground">{t('plans.weekProgress')}</span>
            <span className="text-sm" data-testid="plan-week-totals">
              {t('plans.doneOfPlanned', { done: formatNumber(done), planned: formatNumber(planned) })}
            </span>
          </div>
          <span className="text-2xl font-bold tabular-nums" data-testid="plan-week-percent">
            {formatNumber(percent)}%
          </span>
        </div>
        <ProgressBar value={percent} />
        {unplanned > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="plan-week-unplanned">
            {t('plans.unplanned', { count: unplanned, value: formatNumber(unplanned) })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const STATE_BADGE: Record<Exclude<DayState, 'off' | 'upcoming'>, 'success' | 'warning' | 'default'> = {
  met: 'success',
  short: 'warning',
  today: 'default',
}

/** One day of the week: the plan for it (or a day off) and, once it has started, what was done. */
export function PlanDayCard({
  day,
  entry,
  progress,
  today,
  onEdit,
  onAdd,
}: {
  day: DayKey
  entry?: WeeklyPlanDayDto
  progress?: WeeklyPlanDayProgressDto
  today: DayKey
  /** Shown when the plan may be changed. */
  onEdit?: () => void
  onAdd?: () => void
}) {
  const { t } = useTranslation()
  const isToday = day === today
  const actuals = showsActuals(day, today, progress)
  const done = progress?.done ?? 0
  const unplanned = progress?.unplanned ?? 0
  const state = entry ? dayState(day, today, true, done, entry.targetVisits) : 'off'

  return (
    <Card
      className={cn(
        'gap-2 py-3',
        isToday && 'border-primary/50 ring-1 ring-primary/20',
        !entry && 'bg-muted/30',
      )}
      data-testid="plan-day"
      data-day={day}
    >
      <CardContent className="grid gap-2 px-4">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 font-semibold">
              {formatDayShort(day)}
              {isToday && <Badge>{t('plans.today')}</Badge>}
              {entry && actuals && state !== 'upcoming' && state !== 'off' && (
                <Badge variant={STATE_BADGE[state]} data-testid="plan-day-state">
                  {t(`plans.dayStates.${state}`)}
                </Badge>
              )}
            </span>
            {entry ? (
              <span className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate" data-testid="plan-day-city">
                  {localizedName(entry.cityName, entry.cityNameAr)}
                </span>
              </span>
            ) : (
              <span className="mt-0.5 block text-sm text-muted-foreground">{t('plans.dayOff')}</span>
            )}
          </span>
          {entry && onEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label={t('plans.editDay', { day: formatDayShort(day) })}
              data-testid="plan-day-edit"
            >
              <PencilIcon />
            </Button>
          )}
          {!entry && onAdd && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={onAdd}
              data-testid="plan-day-add"
            >
              <PlusIcon />
              {t('plans.planDay')}
            </Button>
          )}
        </div>

        {entry && (
          <>
            {actuals ? (
              <div className="grid gap-1.5" data-testid="plan-day-actuals">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <TargetIcon className="size-4 text-muted-foreground" aria-hidden />
                    {t('plans.doneOfTarget', {
                      done: formatNumber(done),
                      target: formatNumber(entry.targetVisits),
                    })}
                  </span>
                  {unplanned > 0 && (
                    <span className="text-xs text-muted-foreground" data-testid="plan-day-unplanned">
                      {t('plans.unplanned', { count: unplanned, value: formatNumber(unplanned) })}
                    </span>
                  )}
                </div>
                <ProgressBar value={barPercent(done, entry.targetVisits)} />
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-sm" data-testid="plan-day-target">
                <TargetIcon className="size-4 text-muted-foreground" aria-hidden />
                {t('plans.targetVisits', {
                  count: entry.targetVisits,
                  value: formatNumber(entry.targetVisits),
                })}
              </p>
            )}
            {entry.note && (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <StickyNoteIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span className="whitespace-pre-line">{entry.note}</span>
              </p>
            )}
            {entry.customers.length > 0 && (
              <ul className="grid gap-1 border-t pt-2" data-testid="plan-day-customers">
                {entry.customers.map((c) => {
                  const Icon = c.type === 'pharmacy' ? BuildingIcon : StethoscopeIcon
                  return (
                    <li key={c.customerId} className="flex items-center gap-2 text-sm">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{localizedName(c.name, c.nameAr)}</span>
                      {actuals &&
                        (c.visited ? (
                          <CheckCircle2Icon
                            className="size-4 shrink-0 text-green-text"
                            aria-label={t('plans.visited')}
                            data-testid="plan-customer-visited"
                          />
                        ) : (
                          <CircleIcon
                            className="size-4 shrink-0 text-muted-foreground/60"
                            aria-label={t('plans.notVisited')}
                          />
                        ))}
                    </li>
                  )
                })}
              </ul>
            )}
            {(entry.amPlaces ?? []).length > 0 && (
              <ul className="grid gap-1 border-t pt-2" data-testid="plan-day-am">
                {(entry.amPlaces ?? []).map((c) => (
                  <li key={c.customerId} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="shrink-0 px-1.5">
                      {t('visits.amLabel')}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate">{localizedName(c.name, c.nameAr)}</span>
                    {actuals &&
                      (c.visited ? (
                        <CheckCircle2Icon
                          className="size-4 shrink-0 text-green-text"
                          aria-label={t('plans.visited')}
                        />
                      ) : (
                        <CircleIcon
                          className="size-4 shrink-0 text-muted-foreground/60"
                          aria-label={t('plans.notVisited')}
                        />
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {!entry && actuals && unplanned > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="plan-day-unplanned">
            {t('plans.unplanned', { count: unplanned, value: formatNumber(unplanned) })}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Every status change: who, when, from what to what, and the note. */
export function PlanHistory({ history }: { history: WeeklyPlanEventDto[] }) {
  const { t } = useTranslation()
  if (history.length === 0) return null
  return (
    <Card className="gap-2 py-4" data-testid="plan-history">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
          {t('plans.history')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <ol className="grid gap-3">
          {[...history].reverse().map((event) => (
            <li
              key={event.id}
              className="grid gap-1 border-s-2 ps-3 text-sm"
              data-testid="plan-history-event"
            >
              <span className="flex flex-wrap items-center gap-1.5">
                {event.fromStatus ? (
                  <>
                    <PlanStatusBadge status={event.fromStatus} />
                    <ArrowRightIcon className="size-3.5 text-muted-foreground rtl:rotate-180" aria-hidden />
                    <PlanStatusBadge status={event.toStatus} />
                  </>
                ) : (
                  <span className="font-medium">{t('plans.created')}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {event.actorName} · {formatDateTime(event.createdAt)}
              </span>
              {event.note && <p className="whitespace-pre-line">{event.note}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
