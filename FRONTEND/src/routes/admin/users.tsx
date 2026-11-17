import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { UsersPage } from '@/features/users/UsersPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/users')({
  component: () => (
    <Can permission={P.users.read} fallback={<NoAccess />}>
      <UsersPage />
    </Can>
  ),
})
