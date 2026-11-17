import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RolesPage } from '@/features/roles/RolesPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/roles')({
  component: () => (
    <Can permission={P.roles.read} fallback={<NoAccess />}>
      <RolesPage />
    </Can>
  ),
})
