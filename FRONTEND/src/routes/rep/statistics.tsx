import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepStatsPage } from '@/features/stats/RepStatsPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/rep/statistics')({
  component: () => (
    <Can permission={P.stats.read} fallback={<NoAccess />}>
      <RepStatsPage />
    </Can>
  ),
})
