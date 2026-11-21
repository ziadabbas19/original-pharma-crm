import { createFileRoute } from '@tanstack/react-router'
import type { WeeklyPlanStatus } from '@/api/generated/model'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { PlansPage } from '@/features/plans/PlansPage'
import { isDayKey, type DayKey } from '@/lib/egypt-day'
import { P } from '@/lib/permissions'

interface PlansSearch {
  /** Pending (the default) or all plans. */
  tab?: 'all'
  status?: WeeklyPlanStatus
  rep?: string
  /** Any day of the week to show. */
  week?: DayKey
  page?: number
}

const STATUSES: readonly string[] = ['draft', 'submitted', 'approved', 'returned']

export const Route = createFileRoute('/admin/plans/')({
  validateSearch: (search: Record<string, unknown>): PlansSearch => ({
    tab: search.tab === 'all' ? 'all' : undefined,
    status:
      typeof search.status === 'string' && STATUSES.includes(search.status)
        ? (search.status as WeeklyPlanStatus)
        : undefined,
    rep: typeof search.rep === 'string' && search.rep ? search.rep : undefined,
    week: isDayKey(search.week) ? search.week : undefined,
    page:
      typeof search.page === 'number' && Number.isInteger(search.page) && search.page > 1
        ? search.page
        : undefined,
  }),
  component: () => (
    <Can permission={P.plans.read} fallback={<NoAccess />}>
      <PlansPage />
    </Can>
  ),
})
