import { AlertTriangleIcon, HistoryIcon, LockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { OrderDto } from '@/api/generated/model'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  formatDateTime,
  formatDay,
  formatMoney,
  formatNumber,
  formatPercent,
  localizedName,
} from '@/lib/format'
import { productName } from './order-labels'
import { DeliveryBadge, OrderStatusBadge } from './OrderStatusBadge'
import { ProductThumb } from './ProductPicker'

/** Read-only order content shared by the rep app and the dashboard. */
export function OrderDetails({ order, showRep = false }: { order: OrderDto; showRep?: boolean }) {
  const { t, i18n } = useTranslation()
  const method = order.collectionMethodId
    ? localizedName(order.collectionMethodNameEn, order.collectionMethodNameAr)
    : order.collectionMethodOther
  const names = new Map(
    order.lines.map((l) => [
      l.productId,
      productName({ nameAr: l.productNameAr, nameEn: l.productNameEn }, i18n.resolvedLanguage),
    ]),
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm" dir="ltr">
            {order.number}
          </p>
          <p className="text-sm text-muted-foreground">{formatDay(order.orderDate)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <OrderStatusBadge status={order.status} />
          <DeliveryBadge delivery={order.delivery} />
        </div>
      </div>

      {(order.decidedAt || order.statusReason || order.deliveredAt) && (
        <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
          {order.decidedAt && (
            <p>
              <span className="font-medium">
                {t(`orders.decidedBy.${order.status}`, { name: order.decidedByName ?? '' })}
              </span>{' '}
              <span className="text-muted-foreground">· {formatDateTime(order.decidedAt)}</span>
            </p>
          )}
          {order.statusReason && (
            <p>
              <span className="text-muted-foreground">
                {order.status === 'rejected' ? t('orders.reason') : t('common.note')}:
              </span>{' '}
              {order.statusReason}
            </p>
          )}
          {order.deliveredAt && (
            <p>
              <span className="font-medium">
                {t('orders.deliveredBy', { name: order.deliveredByName ?? '' })}
              </span>{' '}
              <span className="text-muted-foreground">· {formatDateTime(order.deliveredAt)}</span>
            </p>
          )}
          {order.deliveryNote && (
            <p>
              <span className="text-muted-foreground">{t('common.note')}:</span> {order.deliveryNote}
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {showRep && (
          <>
            <dt className="text-muted-foreground">{t('orders.rep')}</dt>
            <dd>
              {order.repName}
              {order.territoryName && (
                <span className="text-muted-foreground">
                  {' '}
                  · {localizedName(order.territoryName, order.territoryNameAr)}
                </span>
              )}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('orders.place')}</dt>
        <dd>
          {order.placeName}{' '}
          <span className="text-muted-foreground">· {t(`orders.placeTypes.${order.placeType}`)}</span>
        </dd>
        <dt className="text-muted-foreground">{t('orders.collectionMethod')}</dt>
        <dd>{method}</dd>
        {order.notes && (
          <>
            <dt className="text-muted-foreground">{t('orders.notes')}</dt>
            <dd className="whitespace-pre-line">{order.notes}</dd>
          </>
        )}
      </dl>

      {order.stockWarnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangleIcon />
          <AlertDescription>
            <p>{t('orders.stockWarning')}</p>
            <ul className="list-inside list-disc">
              {order.stockWarnings.map((w) => (
                <li key={w.productId}>
                  {t('orders.stockWarningLine', {
                    product: names.get(w.productId) ?? '',
                    requested: formatNumber(w.requested),
                    available: formatNumber(w.available),
                  })}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <ul className="divide-y rounded-lg border">
        {order.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 p-3">
            <ProductThumb url={l.thumbnailUrl} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{names.get(l.productId)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatNumber(l.quantity)} × {formatMoney(l.unitPrice)}
                {l.discountPercent > 0 &&
                  ` · ${t('orders.lineDiscount', {
                    percent: formatPercent(l.discountPercent),
                    amount: formatMoney(l.discountAmount),
                  })}`}
              </p>
            </div>
            <span className="text-sm font-medium tabular-nums">{formatMoney(l.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('orders.subtotal')}</span>
          <span className="tabular-nums">{formatMoney(order.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('orders.discount')}</span>
          <span className="tabular-nums">{formatMoney(-order.discountTotal)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-semibold">
          <span>{t('orders.total')}</span>
          <span className="tabular-nums">{formatMoney(order.total)}</span>
        </div>
      </div>

      <section className="grid gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <HistoryIcon className="size-4 text-muted-foreground" />
          {t('orders.history')}
        </h3>
        <ol className="grid gap-2 border-s ps-4">
          {order.history.map((h, i) => (
            <li key={i} className="text-sm">
              <p>
                <span className="font-medium">{t(`orders.actions.${h.action}`)}</span>{' '}
                <span className="text-muted-foreground">· {h.actorName}</span>
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</p>
              {h.reason && <p className="text-xs">{h.reason}</p>}
              {h.internalNote && (
                <p className="flex items-start gap-1 text-xs text-muted-foreground">
                  <LockIcon className="mt-0.5 size-3 shrink-0" aria-label={t('orders.internalNote')} />
                  {h.internalNote}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
