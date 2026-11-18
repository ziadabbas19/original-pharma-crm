import { TruckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DeliveryStatus, OrderStatus } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { DELIVERY_BADGE, STATUS_BADGE } from './order-labels'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation()
  return <Badge variant={STATUS_BADGE[status]}>{t(`orders.statuses.${status}`)}</Badge>
}

/** Delivered or not; nothing before the order is approved. */
export function DeliveryBadge({ delivery }: { delivery?: DeliveryStatus | null }) {
  const { t } = useTranslation()
  if (!delivery) return null
  return (
    <Badge variant={DELIVERY_BADGE[delivery]}>
      <TruckIcon aria-hidden />
      {t(`orders.delivery.${delivery}`)}
    </Badge>
  )
}
