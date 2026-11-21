import { getRouteApi, Link } from '@tanstack/react-router'
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlansList, useUsersList } from '@/api/generated/endpoints'
import type { WeeklyPlanStatus } from '@/api/generated/model'
import { FilterBar } from '@/components/data-table/FilterBar'
import { FilterField } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { isDayKey } from '@/lib/egypt-day'
import { formatDay, formatNumber, formatRelative, formatWeekRange } from '@/lib/format'
import { P } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { PlanStatusBadge } from './plan-display'

const route = getRouteApi('/admin/plans/')
export const PLAN_PAGE_SIZE = 20
const STATUSES: WeeklyPlanStatus[] = ['draft', 'submitted', 'approved', 'returned']

/**
 * Weekly plans of the reps in scope: "Pending" lists the plans waiting for a review (oldest first),
 * "All" every plan with status, rep and week filters (in a bottom sheet on phones).
 */
export function PlansPage() {
  const { t } = useTranslation()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const tab = search.tab ?? 'pending'
  const page = search.page ?? 1
  const set = (patch: Partial<typeof search>) =>
    void navigate({ search: (s) => ({ ...s, page: undefined, ...patch }), replace: true })
  const status: WeeklyPlanStatus | undefined = tab === 'pending' ? 'submitted' : search.status
  const list = usePlansList(
    { status, userId: search.rep, week: search.week, page, pageSize: PLAN_PAGE_SIZE },
    { query: { placeholderData: (previous) => previous, refetchOnMount: 'always' } },
  )
  const canReadUsers = usePermission(P.users.read)
  const users = useUsersList(undefined, { query: { enabled: canReadUsers, staleTime: 60_000 } })
  const reps = useMemo(() => {
    const byId = new Map<string, string>()
    for (const u of users.data ?? []) if (u.isActive) byId.set(u.id, u.fullName)
    for (const p of list.data?.items ?? []) byId.set(p.userId, p.userName)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [users.data, list.data])
  const repName = reps.find(([id]) => id === search.rep)?.[1]
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PLAN_PAGE_SIZE))

  return (
    <>
      <PageHeader title={t('plans.title')} description={t('plans.hint')} />
      <div className="mb-4 inline-flex rounded-control border bg-card p-0.5" role="tablist">
        {(['pending', 'all'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => set({ tab: key === 'pending' ? undefined : key, status: undefined })}
            className={cn(
              'min-h-11 rounded-[10px] px-4 text-sm font-medium',
              tab === key ? 'bg-primary-soft text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid={`plans-tab-${key}`}
          >
            {t(`plans.tabs.${key}`)}
          </button>
        ))}
      </div>

      <FilterBar
        className="mb-4"
        onClearFilters={() => set({ status: undefined, rep: undefined, week: undefined })}
      >
        {tab === 'all' && (
          <FilterField
            label={t('plans.filters.status')}
            active={!!search.status}
            display={search.status ? t(`plans.status.${search.status}`) : undefined}
            onReset={() => set({ status: undefined })}
            className="sm:w-44"
          >
            {(id) => (
              <NativeSelect
                id={id}
                value={search.status ?? ''}
                onChange={(e) =>
                  set({ status: (e.target.value || undefined) as WeeklyPlanStatus | undefined })
                }
                data-testid="plans-filter-status"
              >
                <option value="">{t('plans.filters.anyStatus')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`plans.status.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FilterField>
        )}
        <FilterField
          label={t('plans.filters.rep')}
          active={!!search.rep}
          display={repName}
          onReset={() => set({ rep: undefined })}
          className="sm:w-56"
        >
          {(id) => (
            <NativeSelect
              id={id}
              value={search.rep ?? ''}
              onChange={(e) => set({ rep: e.target.value || undefined })}
              data-testid="plans-filter-rep"
            >
              <option value="">{t('plans.filters.anyRep')}</option>
              {reps.map(([repId, name]) => (
                <option key={repId} value={repId}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FilterField>
        <FilterField
          label={t('plans.filters.week')}
          active={!!search.week}
          display={search.week ? t('plans.filters.weekOf', { day: formatDay(search.week) }) : undefined}
          onReset={() => set({ week: undefined })}
          className="sm:w-48"
        >
          {(id) => (
            <Input
              id={id}
              type="date"
              value={search.week ?? ''}
              onChange={(e) => set({ week: isDayKey(e.target.value) ? e.target.value : undefined })}
              className="h-9 max-sm:h-11"
              data-testid="plans-filter-week"
            />
          )}
        </FilterField>
      </FilterBar>

      {list.isLoading ? (
        <LoadingState rows={4} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data || list.data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarCheckIcon}
            title={tab === 'pending' ? t('plans.emptyPending') : t('plans.empty')}
            description={tab === 'pending' ? t('plans.emptyPendingHint') : undefined}
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="plans-list">
            {list.data.items.map((item) => (
              <li key={item.id}>
                <Link
                  to="/admin/plans/$planId"
                  params={{ planId: item.id }}
                  className="block rounded-card"
                  data-testid="plan-row"
                >
                  <Card className="h-full gap-2 py-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
                    <CardContent className="grid gap-2 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="grid min-w-0 leading-tight">
                          <span className="truncate font-semibold">{item.userName}</span>
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {formatWeekRange(item.weekStart)}
                          </span>
                        </span>
                        <PlanStatusBadge status={item.status} className="shrink-0" />
                      </div>
                      <p className="text-sm">
                        {t('plans.listSummary', {
                          days: formatNumber(item.daysPlanned),
                          visits: formatNumber(item.planned),
                          count: item.daysPlanned,
                        })}
                      </p>
                      {item.status === 'submitted' && item.submittedAt && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ClockIcon className="size-3.5" aria-hidden />
                          {t('plans.sentAgo', { when: formatRelative(item.submittedAt) })}
                        </p>
                      )}
                      {item.reviewedByName && item.status !== 'submitted' && item.reviewedAt && (
                        <p className="text-xs text-muted-foreground">
                          {t('plans.reviewedByAgo', {
                            name: item.reviewedByName,
                            when: formatRelative(item.reviewedAt),
                          })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-3" aria-label={t('plans.pages')}>
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => set({ page: page - 1 > 1 ? page - 1 : undefined })}
                aria-label={t('plans.previousPage')}
              >
                <ChevronLeftIcon className="rtl:rotate-180" />
              </Button>
              <span className="text-sm tabular-nums" data-testid="plans-page">
                {t('plans.pageOf', { page: formatNumber(page), pages: formatNumber(pages) })}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= pages}
                onClick={() => set({ page: page + 1 })}
                aria-label={t('plans.nextPage')}
              >
                <ChevronRightIcon className="rtl:rotate-180" />
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  )
}
