import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { PlacesPage } from '@/features/customers/PlacesPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/places')({
  component: () => (
    <Can permission={P.customers.read} fallback={<NoAccess />}>
      <PlacesPage />
    </Can>
  ),
})
