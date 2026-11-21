import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { PlanDetailPage } from '@/features/plans/PlanDetailPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/plans/$planId')({
  component: () => (
    <Can permission={P.plans.read} fallback={<NoAccess />}>
      <PlanDetailPage />
    </Can>
  ),
})
