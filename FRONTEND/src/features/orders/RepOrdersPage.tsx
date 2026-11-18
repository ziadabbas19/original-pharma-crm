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
import type { BulkResult } from '@/api/generated/model'
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog'
import { SelectionBar } from '@/components/bulk/SelectionBar'
import { useDeleteTarget } from '@/components/bulk/use-bulk-delete'
import { useSelection } from '@/components/bulk/use-selection'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { usePermission } from '@/features/auth/usePermission'
import { errorMessage } from '@/lib/errors'
import { ApiError } from '@/lib/api-client'
import {
  formatDateTime,
  formatDay,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
} from '@/lib/format'
import { P } from '@/lib/permissions'
import { discardFailedOrder, syncOrders, useOrderOutbox } from './order-outbox'
import { DeliveryBadge, OrderStatusBadge } from './OrderStatusBadge'

const outboxId = (item: { id: number }) => String(item.id)

/** "My orders" in the rep app: waiting to sync, needs attention, then the orders on the server. */
export function RepOrdersPage() {
  const { t } = useTranslation()
  const canCreate = usePermission(P.orders.create)
  const canRead = usePermission(P.orders.read)
  const outbox = useOrderOutbox()
  const orders = useOrdersList({ Mine: true }, { query: { enabled: canRead } })
  const failedSelection = useSelection(outbox.failed, outboxId)
  const discard = useDeleteTarget()

  /** The refused orders only live on this device, so discarding them needs no server call. */
  const discardOrders = async ({ ids }: { ids: string[] }): Promise<BulkResult> => {
    await Promise.all(ids.map((id) => discardFailedOrder(Number(id))))
    return {
      deleted: ids.length,
      archived: 0,
      restored: 0,
      updated: 0,
      blocked: 0,
      dryRun: false,
      items: ids.map((id) => ({ id, outcome: 'deleted' as const })),
    }
  }
  const failedName = (id: string) =>
    outbox.failed.find((item) => String(item.id) === id)?.payload.request.placeName ?? id

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
          <div className="overflow-hidden rounded-lg border">
            <label className="flex items-center gap-2 px-3 py-2 text-sm">
              <Checkbox
                checked={
                  failedSelection.allSelected ? true : failedSelection.someSelected ? 'indeterminate' : false
                }
                onCheckedChange={(v) => failedSelection.setAll(v === true)}
              />
              {t('bulk.selectAll', {
                count: failedSelection.total,
                value: formatNumber(failedSelection.total),
              })}
            </label>
            <SelectionBar selection={failedSelection} className="static border-t border-b-0">
              <Button size="sm" variant="destructive" onClick={() => discard.open(failedSelection.ids)}>
                <Trash2Icon />
                {t('orders.discard')}
              </Button>
            </SelectionBar>
          </div>
          {outbox.failed.map((item) => (
            <Card key={item.id} className="border-destructive/40 py-3">
              <CardContent className="grid gap-2 px-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    aria-label={t('bulk.selectRow', { name: item.payload.request.placeName })}
                    checked={failedSelection.has(String(item.id))}
                    onCheckedChange={(v) => failedSelection.toggle(String(item.id), v === true)}
                  />
                  <p className="min-w-0 flex-1 truncate font-medium">{item.payload.request.placeName}</p>
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
                  <Button size="sm" variant="ghost" onClick={() => discard.open([String(item.id)])}>
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
                        {o.decidedAt && (
                          <p className="text-xs text-muted-foreground">
                            {t(`orders.decidedBy.${o.status}`, { name: o.decidedByName ?? '' })} ·{' '}
                            {formatDateTime(o.decidedAt)}
                          </p>
                        )}
                        {o.statusReason && <p className="line-clamp-2 text-xs">{o.statusReason}</p>}
                      </div>
                      <div className="grid shrink-0 justify-items-end gap-1">
                        <OrderStatusBadge status={o.status} />
                        <DeliveryBadge delivery={o.delivery} />
                        <span className="text-sm font-medium tabular-nums">{formatMoney(o.total)}</span>
                        {(o.discountTotal ?? 0) > 0 && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {t('orders.discountShort', { value: formatMoney(o.discountTotal) })}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {discard.ids && (
        <BulkDeleteDialog
          ids={discard.ids}
          nameOf={failedName}
          verb="discard"
          preview={false}
          consequence={t('orders.discardConsequence')}
          run={discardOrders}
          onDone={() => failedSelection.clear()}
          onClose={discard.close}
        />
      )}
    </div>
  )
}
