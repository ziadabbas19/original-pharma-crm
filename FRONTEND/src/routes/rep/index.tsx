import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepHomePage } from '@/features/tracking/RepHomePage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/rep/')({
  component: () => (
    <Can permission={P.tracking.report} fallback={<NoAccess />}>
      <RepHomePage />
    </Can>
  ),
})
