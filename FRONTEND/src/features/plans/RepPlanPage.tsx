import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  CalendarCheckIcon,
  InfoIcon,
  SendIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getPlansMineQueryKey, plansSaveDraft, plansSubmit, usePlansMine } from '@/api/generated/endpoints'
import type { WeeklyPlanDayInput, WeeklyPlanDto } from '@/api/generated/model'
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WeekNavigator } from '@/components/WeekNavigator'
import { useDoctorReferenceData } from '@/features/orders/use-order-data'
import { useRepCustomers } from '@/features/visits/use-rep-customers'
import { useOnline } from '@/hooks/use-online'
import { egyptToday, weekDays, weekStartOf, type DayKey } from '@/lib/egypt-day'
import { handleError, isAppError, normalizeError, type AppError } from '@/lib/errors'
import { formatWeekRange, localizedName } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { readCache, writeCache } from '@/lib/offline-cache'
import { DayPlanDialog } from './DayPlanDialog'
import { PlanDayCard, PlanHistory, PlanStatusBadge, ReviewNote, WeekProgressCard } from './plan-display'
import { planCacheKey, toInputs, withDay, withoutDay, type PlanCustomerOption } from './plan-input'

const route = getRouteApi('/rep/plans')

/**
 * "My weekly plan": one week at a time with a navigator. The rep plans each day (city, number of
 * visits, note, customers), sends the week to the manager and reads the answer. Every change is saved
 * on the server at once; offline, the last copy is shown read-only.
 */
export function RepPlanPage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const queryClient = useQueryClient()
  const online = useOnline()
  const cacheKey = planCacheKey(search.week)
  const copy = readCache<WeeklyPlanDto>(cacheKey)
  const query = usePlansMine(
    { week: search.week },
    {
      query: {
        initialData: copy?.data,
        initialDataUpdatedAt: copy?.savedAt,
        staleTime: 15_000,
        // A manager may have answered meanwhile: the copy shows at once, the server is asked anyway.
        refetchOnMount: 'always',
      },
    },
  )
  const plan = query.data
  const { towns } = useDoctorReferenceData()
  const { doctors, pharmacies } = useRepCustomers()
  const [editing, setEditing] = useState<DayKey | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (query.data && query.isFetchedAfterMount && !query.isError) writeCache(cacheKey, query.data)
  }, [cacheKey, query.data, query.isFetchedAfterMount, query.isError])

  const customers = useMemo<PlanCustomerOption[]>(
    () => [
      ...(doctors ?? []).map((d) => ({
        id: d.id,
        type: 'doctor' as const,
        name: d.name,
        nameAr: d.nameAr,
        townId: d.townId,
        hint: localizedName(d.specialtyNameEn, d.specialtyNameAr) || null,
      })),
      ...(pharmacies ?? []).map((p) => ({
        id: p.id,
        type: 'pharmacy' as const,
        name: p.name,
        nameAr: p.nameAr,
        townId: p.territoryId,
        hint: p.address,
      })),
    ],
    [doctors, pharmacies],
  )

  const today = plan?.today ?? egyptToday()
  const current = plan?.currentWeekStart ?? weekStartOf(today)
  const weekStart = plan?.weekStart ?? search.week ?? current
  // Offline (or the server could not be reached): the copy on the phone, read-only.
  const stale = !online || (query.isError && !!plan)
  const editable = !!plan?.canEdit && !stale

  const changeWeek = (week: DayKey) =>
    void navigate({ search: { week: week === current ? undefined : week }, replace: true })

  const applied = (next: WeeklyPlanDto) => {
    queryClient.setQueryData(getPlansMineQueryKey({ week: search.week }), next)
    writeCache(cacheKey, next)
    void invalidateApi(queryClient, '/api/plans')
  }

  /** A refused change because the plan moved on (another device, a manager's answer): reload it. */
  const reloadOnConflict = (error: unknown) => {
    const e = isAppError(error) ? error : normalizeError(error)
    if (e.kind === 'conflict') void query.refetch()
  }

  const saveDays = async (days: WeeklyPlanDayInput[]) => {
    if (!plan) return
    try {
      applied(await plansSaveDraft({ week: plan.weekStart, days, version: plan.id ? plan.version : null }))
    } catch (error) {
      reloadOnConflict(error)
      throw error
    }
  }

  if (!plan) {
    return (
      <div className="space-y-4" data-testid="rep-plan">
        <PlanHeader />
        <WeekNavigator value={weekStart} current={current} onChange={changeWeek} />
        {query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingState rows={4} />
        )}
      </div>
    )
  }

  const entries = new Map(plan.days.map((d) => [d.day, d]))
  const progress = new Map(plan.progress.days.map((d) => [d.day, d]))
  const days = weekDays(plan.weekStart)
  const pastWithoutPlan = !plan.id && !plan.canEdit
  const editingEntry = editing ? entries.get(editing) : undefined

  return (
    <div className="space-y-4" data-testid="rep-plan">
      <PlanHeader status={plan.id ? <PlanStatusBadge status={plan.status} /> : undefined} />
      <WeekNavigator value={plan.weekStart} current={current} onChange={changeWeek} />

      {stale && (
        <Alert variant="warning" data-testid="plan-offline">
          <WifiOffIcon />
          <AlertDescription>{t('plans.offlineCopy')}</AlertDescription>
        </Alert>
      )}

      <ReviewNote plan={plan} />
      <StatusLine plan={plan} />

      {pastWithoutPlan ? (
        <Card>
          <EmptyState icon={CalendarCheckIcon} title={t('plans.noPlanPast')} />
        </Card>
      ) : (
        <>
          {(plan.progress.planned > 0 || plan.progress.unplanned > 0) && plan.weekStart <= today && (
            <WeekProgressCard plan={plan} />
          )}
          <div className="grid gap-3 md:grid-cols-2" data-testid="plan-days">
            {days.map((day) => (
              <PlanDayCard
                key={day}
                day={day}
                entry={entries.get(day)}
                progress={progress.get(day)}
                today={today}
                onEdit={editable ? () => setEditing(day) : undefined}
                onAdd={editable ? () => setEditing(day) : undefined}
              />
            ))}
          </div>
        </>
      )}

      {plan.canEdit && (
        <div className="grid gap-2">
          <Button
            size="lg"
            className="w-full"
            disabled={!editable || !plan.canSubmit || !plan.reviewerName}
            onClick={() => setSubmitting(true)}
            data-testid="plan-submit"
          >
            <SendIcon />
            {plan.status === 'returned' ? t('plans.resubmit') : t('plans.submit')}
          </Button>
          {!plan.canSubmit && plan.reviewerName && (
            <p className="text-center text-xs text-muted-foreground">{t('plans.submitHint')}</p>
          )}
        </div>
      )}

      <PlanHistory history={plan.history} />

      {editing && (
        <DayPlanDialog
          day={editing}
          entry={editingEntry}
          towns={towns.data ?? []}
          customers={customers}
          onClose={() => setEditing(null)}
          onSave={(input) => saveDays(withDay(toInputs(plan), input))}
          onRemove={editingEntry ? () => saveDays(withoutDay(toInputs(plan), editing)) : undefined}
        />
      )}

      {submitting && plan.id && (
        <SubmitDialog
          plan={plan}
          onClose={() => setSubmitting(false)}
          onSubmit={async () => {
            try {
              applied(await plansSubmit(plan.id!, { version: plan.version }))
            } catch (error) {
              reloadOnConflict(error)
              throw error
            }
          }}
        />
      )}
    </div>
  )
}

function PlanHeader({ status }: { status?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
        <Link to="/rep">
          <ArrowLeftIcon className="rtl:rotate-180" />
        </Link>
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{t('plans.myTitle')}</h1>
      {status}
    </div>
  )
}

/** Where the plan stands: waiting for whom, or who it will go to. */
function StatusLine({ plan }: { plan: WeeklyPlanDto }) {
  const { t } = useTranslation()
  if (plan.status === 'submitted') {
    return (
      <Alert variant="info" data-testid="plan-waiting">
        <InfoIcon />
        <AlertDescription>
          {plan.reviewerName
            ? t('plans.waitingFor', { name: plan.reviewerName })
            : t('plans.waitingForManager')}
        </AlertDescription>
      </Alert>
    )
  }
  if (!plan.canEdit) return null
  if (!plan.reviewerName) {
    return (
      <Alert variant="warning" data-testid="plan-no-reviewer">
        <TriangleAlertIcon />
        <AlertTitle>{t('plans.noReviewerTitle')}</AlertTitle>
        <AlertDescription>{t('errors.plan_no_reviewer')}</AlertDescription>
      </Alert>
    )
  }
  return (
    <p className="px-1 text-sm text-muted-foreground" data-testid="plan-goes-to">
      {t('plans.goesTo', { name: plan.reviewerName })}
    </p>
  )
}

function SubmitDialog({
  plan,
  onSubmit,
  onClose,
}: {
  plan: WeeklyPlanDto
  onSubmit: () => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSubmit()
      onClose()
    } catch (err) {
      setError(handleError(err, { silent: true, context: 'plans.submit' }))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="plan-submit-dialog">
        <DialogHeader>
          <DialogTitle>{t('plans.submitTitle', { week: formatWeekRange(plan.weekStart) })}</DialogTitle>
          <DialogDescription>{t('plans.submitText', { name: plan.reviewerName ?? '' })}</DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void send()} disabled={busy} data-testid="plan-submit-confirm">
            <SendIcon />
            {busy ? t('common.saving') : t('plans.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
