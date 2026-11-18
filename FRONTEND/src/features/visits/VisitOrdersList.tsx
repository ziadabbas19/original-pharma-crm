import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, ReceiptTextIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { VisitOrderDto } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { STATUS_BADGE } from '@/features/orders/order-labels'
import { formatMoney } from '@/lib/format'

/** Orders taken during the visit, linked to the order screen of the app that shows them. */
export function VisitOrdersList({ orders, app }: { orders: VisitOrderDto[]; app: 'rep' | 'admin' }) {
  const { t } = useTranslation()
  if (orders.length === 0) return null
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" data-testid="visit-orders">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <ReceiptTextIcon className="size-4 text-muted-foreground" aria-hidden />
        {t('visits.linkedOrders')}
      </h3>
      <ul className="divide-y rounded-lg border">
        {orders.map((order) => {
          const row = (
            <>
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="truncate font-medium tabular-nums">{order.number}</span>
                <Badge variant={STATUS_BADGE[order.status]}>{t(`orders.statuses.${order.status}`)}</Badge>
              </span>
              <span className="tabular-nums">{formatMoney(order.total)}</span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                aria-hidden
              />
            </>
          )
          const className = 'flex min-h-11 items-center gap-2 p-2 text-sm hover:bg-accent/50'
          return (
            <li key={order.id}>
              {app === 'rep' ? (
                <Link to="/rep/orders/$orderId" params={{ orderId: order.id }} className={className}>
                  {row}
                </Link>
              ) : (
                <Link to="/admin/orders" search={{ order: order.id }} className={className}>
                  {row}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
