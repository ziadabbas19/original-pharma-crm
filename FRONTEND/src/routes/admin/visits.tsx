import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { VisitsPage } from '@/features/visits/VisitsPage'
import { P } from '@/lib/permissions'

interface VisitsSearch {
  /** Visit to open (links from notifications). */
  visit?: string
}

export const Route = createFileRoute('/admin/visits')({
  validateSearch: (search: Record<string, unknown>): VisitsSearch => ({
    visit: typeof search.visit === 'string' ? search.visit : undefined,
  }),
  component: () => (
    <Can permission={P.visits.read} fallback={<NoAccess />}>
      <VisitsPage />
    </Can>
  ),
})
