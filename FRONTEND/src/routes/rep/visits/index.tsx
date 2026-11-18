import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepVisitsPage } from '@/features/visits/RepVisitsPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/rep/visits/')({
  component: () => (
    <Can permission={P.visits.read} fallback={<NoAccess />}>
      <RepVisitsPage />
    </Can>
  ),
})
