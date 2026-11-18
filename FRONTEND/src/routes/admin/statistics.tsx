import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { StatsPage } from '@/features/stats/StatsPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/statistics')({
  component: () => (
    <Can permission={P.stats.read} fallback={<NoAccess />}>
      <StatsPage />
    </Can>
  ),
})
