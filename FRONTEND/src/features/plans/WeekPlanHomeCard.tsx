import { Link } from '@tanstack/react-router'
import { CalendarCheckIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlansMine } from '@/api/generated/endpoints'
import type { WeeklyPlanDto } from '@/api/generated/model'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ProgressRing } from '@/features/home/HomeSections'
import { formatNumber, formatWeekRange } from '@/lib/format'
import { readCache, writeCache } from '@/lib/offline-cache'
import { PlanStatusBadge } from './plan-display'
import { planCacheKey } from './plan-input'

/** Home: this week's plan at a glance (status and progress), opening the plan. */
export function WeekPlanHomeCard() {
  const { t } = useTranslation()
  const cacheKey = planCacheKey(undefined)
  const copy = readCache<WeeklyPlanDto>(cacheKey)
  const query = usePlansMine(undefined, {
    query: {
      initialData: copy?.data,
      initialDataUpdatedAt: copy?.savedAt,
      staleTime: 60_000,
      refetchOnMount: 'always',
    },
  })
  const plan = query.data
  useEffect(() => {
    if (query.data && query.isFetchedAfterMount && !query.isError) writeCache(cacheKey, query.data)
  }, [cacheKey, query.data, query.isFetchedAfterMount, query.isError])

  if (!plan && query.isError) return null

  const percent = plan?.progress.percent ?? 0
  return (
    <Link to="/rep/plans" className="block rounded-card" data-testid="home-week-plan">
      <Card className="py-3 transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center gap-3 px-4">
          {plan?.id ? (
            <ProgressRing value={percent / 100} className="size-14">
              <span className="text-xs font-bold tabular-nums">{formatNumber(percent)}%</span>
            </ProgressRing>
          ) : (
            <span className="flex size-10 items-center justify-center rounded-[12px] bg-primary-soft text-primary-soft-foreground">
              <CalendarCheckIcon className="size-5" aria-hidden />
            </span>
          )}
          <span className="grid min-w-0 flex-1 gap-0.5 leading-tight">
            <span className="flex flex-wrap items-center gap-1.5 font-medium">
              {t('plans.homeTitle')}
              {plan?.id && <PlanStatusBadge status={plan.status} />}
            </span>
            {!plan ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <span className="truncate text-sm text-muted-foreground">
                {plan.id
                  ? t('plans.doneOfPlanned', {
                      done: formatNumber(plan.progress.done),
                      planned: formatNumber(plan.progress.planned),
                    })
                  : t('plans.homeNoPlan', { week: formatWeekRange(plan.weekStart) })}
              </span>
            )}
          </span>
          <ChevronRightIcon className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
        </CardContent>
      </Card>
    </Link>
  )
}
