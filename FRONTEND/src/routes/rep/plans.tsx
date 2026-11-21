import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepPlanPage } from '@/features/plans/RepPlanPage'
import { isDayKey, type DayKey } from '@/lib/egypt-day'
import { P } from '@/lib/permissions'

interface PlanSearch {
  /** Any day of the week to show; this week when missing. */
  week?: DayKey
}

export const Route = createFileRoute('/rep/plans')({
  validateSearch: (search: Record<string, unknown>): PlanSearch => ({
    week: isDayKey(search.week) ? search.week : undefined,
  }),
  component: () => (
    <Can permission={P.plans.readOwn} fallback={<NoAccess />}>
      <RepPlanPage />
    </Can>
  ),
})
