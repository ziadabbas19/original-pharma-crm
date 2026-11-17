import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { DoctorsPage } from '@/features/doctors/DoctorsPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/doctors')({
  component: () => (
    <Can permission={P.customers.read} fallback={<NoAccess />}>
      <DoctorsPage />
    </Can>
  ),
})
