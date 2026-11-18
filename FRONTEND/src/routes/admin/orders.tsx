import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { OrdersPage } from '@/features/orders/OrdersPage'
import { P } from '@/lib/permissions'

interface OrdersSearch {
  /** Order to open (links from notifications). */
  order?: string
}

export const Route = createFileRoute('/admin/orders')({
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ({
    order: typeof search.order === 'string' ? search.order : undefined,
  }),
  component: () => (
    <Can permission={P.orders.read} fallback={<NoAccess />}>
      <OrdersPage />
    </Can>
  ),
})
