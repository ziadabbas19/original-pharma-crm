import { Link } from '@tanstack/react-router'
import {
  AlertCircleIcon,
  ClipboardListIcon,
  CloudOffIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOrdersList } from '@/api/generated/endpoints'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePermission } from '@/features/auth/usePermission'
import { errorMessage } from '@/lib/errors'
import { ApiError } from '@/lib/api-client'
import { formatDay, formatMoney, formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { P } from '@/lib/permissions'
import { discardFailedOrder, syncOrders, useOrderOutbox } from './order-outbox'
import { OrderStatusBadge } from './OrderStatusBadge'

/** "My orders" in the rep app: waiting to sync, needs attention, then the orders on the server. */
export function RepOrdersPage() {
  const { t } = useTranslation()
  const canCreate = usePermission(P.orders.create)
  const canRead = usePermission(P.orders.read)
  const outbox = useOrderOutbox()
  const orders = useOrdersList({ Mine: true }, { query: { enabled: canRead } })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('orders.mine')}</h1>
        {canCreate && (
          <Button asChild>
            <Link to="/rep/orders/new">
              <PlusIcon />
              {t('orders.new')}
            </Link>
          </Button>
        )}
      </div>

      {outbox.pending.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <CloudOffIcon className="size-4 text-muted-foreground" />
              {t('orders.pendingTitle', {
                count: outbox.pending.length,
                value: formatNumber(outbox.pending.length),
              })}
            </h2>
            <Button size="sm" variant="ghost" onClick={() => void syncOrders()} disabled={outbox.syncing}>
              <RefreshCwIcon className={outbox.syncing ? 'animate-spin' : undefined} />
              {t('orders.syncNow')}
            </Button>
          </div>
          {outbox.pending.map((item) => (
            <Card key={item.id} className="py-3">
              <CardContent className="flex items-center justify-between gap-3 px-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.payload.request.placeName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDay(item.payload.request.orderDate)} · {formatRelative(item.payload.queuedAt)}
                  </p>
                </div>
                <div className="text-end">
                  <Badge variant="warning">{t('orders.waitingToSync')}</Badge>
                  <p className="mt-1 text-sm tabular-nums">{formatMoney(item.payload.estimatedTotal)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {outbox.failed.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircleIcon className="size-4" />
            {t('orders.failedTitle')}
          </h2>
          {outbox.failed.map((item) => (
            <Card key={item.id} className="border-destructive/40 py-3">
              <CardContent className="grid gap-2 px-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-medium">{item.payload.request.placeName}</p>
                  <span className="text-sm tabular-nums">{formatMoney(item.payload.estimatedTotal)}</span>
                </div>
                <p className="text-sm text-destructive">
                  {errorMessage(
                    new ApiError(item.payload.error.status, {
                      code: item.payload.error.code,
                      title: item.payload.error.title,
                      maxDiscountPercent: item.payload.error.maxDiscountPercent,
                    }),
                    t,
                  )}
                  {item.payload.error.maxDiscountPercent !== undefined &&
                    ` (${formatPercent(item.payload.error.maxDiscountPercent)})`}
                </p>
                <div className="flex gap-2">
                  <Button asChild size="sm">
                    <Link to="/rep/orders/new" search={{ retry: item.id }}>
                      {t('orders.fixAndResend')}
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void discardFailedOrder(item.id)}>
                    <Trash2Icon />
                    {t('orders.discard')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {canRead &&
        (orders.isLoading ? (
          <LoadingState rows={4} />
        ) : orders.error ? (
          <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
        ) : (orders.data ?? []).length === 0 && outbox.pending.length === 0 ? (
          <EmptyState
            icon={ClipboardListIcon}
            title={t('orders.emptyMine')}
            description={t('orders.emptyMineHint')}
          />
        ) : (
          <ul className="space-y-2">
            {(orders.data ?? []).map((o) => (
              <li key={o.id}>
                <Link to="/rep/orders/$orderId" params={{ orderId: o.id }} className="block">
                  <Card className="py-3 transition-colors hover:bg-accent/50">
                    <CardContent className="flex items-center justify-between gap-3 px-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{o.placeName}</p>
                        <p className="text-xs text-muted-foreground">
                          <span dir="ltr" className="font-mono">
                            {o.number}
                          </span>{' '}
                          · {formatDay(o.orderDate)}
                        </p>
                      </div>
                      <div className="grid justify-items-end gap-1">
                        <OrderStatusBadge status={o.status} />
                        <span className="text-sm font-medium tabular-nums">{formatMoney(o.total)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
