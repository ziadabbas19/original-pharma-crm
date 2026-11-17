import { useTranslation } from 'react-i18next'
import type { OrderStatus } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { STATUS_BADGE } from './order-labels'

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation()
  return <Badge variant={STATUS_BADGE[status]}>{t(`orders.statuses.${status}`)}</Badge>
}
