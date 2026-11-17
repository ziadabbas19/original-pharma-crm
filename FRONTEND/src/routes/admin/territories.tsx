import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { TerritoriesPage } from '@/features/territories/TerritoriesPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/territories')({
  component: () => (
    <Can permission={P.territories.read} fallback={<NoAccess />}>
      <TerritoriesPage />
    </Can>
  ),
})
