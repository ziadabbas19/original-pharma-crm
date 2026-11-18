import { createFileRoute } from '@tanstack/react-router'
import type { PlaceType } from '@/api/generated/model'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { NewOrderPage } from '@/features/orders/NewOrderPage'
import { P } from '@/lib/permissions'

const PLACE_TYPES: readonly string[] = ['pharmacy', 'warehouse', 'shop', 'other']

interface NewOrderSearch {
  /** Outbox id of a refused order to fix and send again. */
  retry?: number
  /** The visit the order is taken in, with the customer it starts from. */
  visitId?: string
  customerId?: string
  placeName?: string
  placeType?: PlaceType
}

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

export const Route = createFileRoute('/rep/orders/new')({
  validateSearch: (search: Record<string, unknown>): NewOrderSearch => ({
    retry: typeof search.retry === 'number' ? search.retry : undefined,
    visitId: text(search.visitId),
    customerId: text(search.customerId),
    placeName: text(search.placeName),
    placeType: PLACE_TYPES.includes(String(search.placeType)) ? (search.placeType as PlaceType) : undefined,
  }),
  component: () => (
    <Can permission={P.orders.create} fallback={<NoAccess />}>
      <NewOrderPage />
    </Can>
  ),
})
