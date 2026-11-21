import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowLeftIcon, CheckIcon, RotateCcwIcon, Undo2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlansGetQueryKey, usePlansGet } from '@/api/generated/endpoints'
import type { WeeklyPlanDto } from '@/api/generated/model'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { weekDays } from '@/lib/egypt-day'
import { formatRelative, formatWeekRange } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { PlanDayCard, PlanHistory, PlanStatusBadge, ReviewNote, WeekProgressCard } from './plan-display'
import { ReviewPlanDialog, type ReviewMode } from './ReviewPlanDialog'

const route = getRouteApi('/admin/plans/$planId')

/** One rep's week for a manager: the days, planned against done, the history, and the review actions. */
export function PlanDetailPage() {
  const { t } = useTranslation()
  const { planId } = route.useParams()
  const queryClient = useQueryClient()
  // The rep or another manager may have changed the plan since it was last read.
  const query = usePlansGet(planId, { query: { refetchOnMount: 'always' } })
  const [reviewing, setReviewing] = useState<ReviewMode | null>(null)
  const plan = query.data

  const done = (next: WeeklyPlanDto) => {
    queryClient.setQueryData(getPlansGetQueryKey(planId), next)
    void invalidateApi(queryClient, '/api/plans')
  }

  return (
    <div className="space-y-4" data-testid="plan-detail">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/admin/plans">
            <ArrowLeftIcon className="rtl:rotate-180" />
          </Link>
        </Button>
        <div className="grid min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-xl font-bold md:text-2xl">{plan?.userName ?? t('plans.title')}</h1>
          {plan && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatWeekRange(plan.weekStart)}
            </span>
          )}
        </div>
        {plan && <PlanStatusBadge status={plan.status} />}
      </div>

      {!plan ? (
        query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingState rows={4} />
        )
      ) : (
        <>
          {(plan.canReview || plan.canReopen) && (
            <div className="flex flex-wrap gap-2" data-testid="plan-review-actions">
              {plan.canReview && (
                <>
                  <Button
                    className="min-h-11 flex-1 sm:flex-none"
                    onClick={() => setReviewing('approve')}
                    data-testid="plan-approve"
                  >
                    <CheckIcon />
                    {t('plans.review.approve')}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 sm:flex-none"
                    onClick={() => setReviewing('return')}
                    data-testid="plan-return"
                  >
                    <Undo2Icon />
                    {t('plans.review.return')}
                  </Button>
                </>
              )}
              {plan.canReopen && (
                <Button
                  variant="outline"
                  className="min-h-11 flex-1 sm:flex-none"
                  onClick={() => setReviewing('reopen')}
                  data-testid="plan-reopen"
                >
                  <RotateCcwIcon />
                  {t('plans.review.reopen')}
                </Button>
              )}
            </div>
          )}

          {plan.status === 'submitted' && plan.submittedAt && (
            <p className="px-1 text-sm text-muted-foreground">
              {t('plans.sentAgo', { when: formatRelative(plan.submittedAt) })}
            </p>
          )}
          <ReviewNote plan={plan} />
          {plan.weekStart <= plan.today && <WeekProgressCard plan={plan} />}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="plan-days">
            {weekDays(plan.weekStart).map((day) => (
              <PlanDayCard
                key={day}
                day={day}
                entry={plan.days.find((d) => d.day === day)}
                progress={plan.progress.days.find((d) => d.day === day)}
                today={plan.today}
              />
            ))}
          </div>
          <PlanHistory history={plan.history} />
          {reviewing && (
            <ReviewPlanDialog
              plan={plan}
              mode={reviewing}
              onDone={done}
              onConflict={() => void query.refetch()}
              onClose={() => setReviewing(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
