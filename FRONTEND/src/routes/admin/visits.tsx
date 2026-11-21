import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { VisitsPage } from '@/features/visits/VisitsPage'
import { isDayKey, type DayKey } from '@/lib/egypt-day'
import { P } from '@/lib/permissions'

interface VisitsSearch {
  /** Visit to open (links from notifications). */
  visit?: string
  /** One day at a time for one rep instead of a date range. */
  view?: 'day'
  /** The day of the day view (Egypt day); today when missing. */
  day?: DayKey
  /** The rep of the day view. */
  rep?: string
}

export const Route = createFileRoute('/admin/visits')({
  validateSearch: (search: Record<string, unknown>): VisitsSearch => ({
    visit: typeof search.visit === 'string' ? search.visit : undefined,
    view: search.view === 'day' ? 'day' : undefined,
    day: isDayKey(search.day) ? search.day : undefined,
    rep: typeof search.rep === 'string' && search.rep ? search.rep : undefined,
  }),
  component: () => (
    <Can permission={P.visits.read} fallback={<NoAccess />}>
      <VisitsPage />
    </Can>
  ),
})
