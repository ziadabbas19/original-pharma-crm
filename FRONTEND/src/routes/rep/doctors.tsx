import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepDoctorsPage } from '@/features/doctors/RepDoctorsPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/rep/doctors')({
  component: () => (
    <Can permission={P.customers.read} fallback={<NoAccess />}>
      <RepDoctorsPage />
    </Can>
  ),
})
