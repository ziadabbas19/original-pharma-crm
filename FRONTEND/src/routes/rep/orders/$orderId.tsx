import { createFileRoute } from '@tanstack/react-router'
import { RepOrderDetailPage } from '@/features/orders/RepOrderDetailPage'

export const Route = createFileRoute('/rep/orders/$orderId')({
  component: RepOrderDetailPage,
})
