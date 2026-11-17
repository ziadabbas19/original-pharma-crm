import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { OrdersPage } from '@/features/orders/OrdersPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/orders')({
  component: () => (
    <Can permission={P.orders.read} fallback={<NoAccess />}>
      <OrdersPage />
    </Can>
  ),
})
