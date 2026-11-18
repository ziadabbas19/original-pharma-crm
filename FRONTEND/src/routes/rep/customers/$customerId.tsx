import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepCustomerPage } from '@/features/visits/RepCustomerPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/rep/customers/$customerId')({
  component: () => (
    <Can permission={P.customers.read} fallback={<NoAccess />}>
      <RepCustomerPage />
    </Can>
  ),
})
