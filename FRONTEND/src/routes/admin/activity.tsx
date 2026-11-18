import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { ActivityLogPage } from '@/features/audit/ActivityLogPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/activity')({
  component: () => (
    <Can permission={P.audit.read} fallback={<NoAccess />}>
      <ActivityLogPage />
    </Can>
  ),
})
