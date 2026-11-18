import { createFileRoute } from '@tanstack/react-router'
import { RepVisitDetailPage } from '@/features/visits/RepVisitDetailPage'

export const Route = createFileRoute('/rep/visits/$visitId')({
  component: RepVisitDetailPage,
})
