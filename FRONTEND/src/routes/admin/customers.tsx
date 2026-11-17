import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { CustomersPage } from '@/features/customers/CustomersPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/customers')({
  component: () => (
    <Can permission={P.customers.read} fallback={<NoAccess />}>
      <CustomersPage />
    </Can>
  ),
})
