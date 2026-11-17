import { createFileRoute } from '@tanstack/react-router'
import { RepOrdersPage } from '@/features/orders/RepOrdersPage'

export const Route = createFileRoute('/rep/orders/')({
  component: RepOrdersPage,
})
