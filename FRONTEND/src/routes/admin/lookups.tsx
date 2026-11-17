import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { LookupsPage } from '@/features/lookups/LookupsPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/lookups')({
  component: () => (
    <Can permission={P.lookups.manage} fallback={<NoAccess />}>
      <LookupsPage />
    </Can>
  ),
})
