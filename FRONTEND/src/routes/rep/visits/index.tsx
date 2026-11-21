import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepVisitsPage } from '@/features/visits/RepVisitsPage'
import { isDayKey, type DayKey } from '@/lib/egypt-day'
import { P } from '@/lib/permissions'

interface RepVisitsSearch {
  /**
   * The day shown (yyyy-MM-dd, Egypt day). Kept in the address so going to a visit and back keeps it;
   * opening the screen from the tab bar starts at today.
   */
  day?: DayKey
}

export const Route = createFileRoute('/rep/visits/')({
  validateSearch: (search: Record<string, unknown>): RepVisitsSearch => ({
    day: isDayKey(search.day) ? search.day : undefined,
  }),
  component: () => (
    <Can permission={P.visits.read} fallback={<NoAccess />}>
      <RepVisitsPage />
    </Can>
  ),
})
