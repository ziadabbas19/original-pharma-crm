import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { NewOrderPage } from '@/features/orders/NewOrderPage'
import { P } from '@/lib/permissions'

interface NewOrderSearch {
  /** Outbox id of a refused order to fix and send again. */
  retry?: number
}

export const Route = createFileRoute('/rep/orders/new')({
  validateSearch: (search: Record<string, unknown>): NewOrderSearch => ({
    retry: typeof search.retry === 'number' ? search.retry : undefined,
  }),
  component: () => (
    <Can permission={P.orders.create} fallback={<NoAccess />}>
      <NewOrderPage />
    </Can>
  ),
})
