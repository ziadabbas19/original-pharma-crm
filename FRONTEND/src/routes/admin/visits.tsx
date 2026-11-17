import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { VisitsPage } from '@/features/visits/VisitsPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/visits')({
  component: () => (
    <Can permission={P.visits.read} fallback={<NoAccess />}>
      <VisitsPage />
    </Can>
  ),
})
