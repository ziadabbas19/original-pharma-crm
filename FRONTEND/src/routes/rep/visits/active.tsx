import { createFileRoute } from '@tanstack/react-router'
import { ActiveVisitPage } from '@/features/visits/ActiveVisitPage'

export const Route = createFileRoute('/rep/visits/active')({
  component: ActiveVisitPage,
})
