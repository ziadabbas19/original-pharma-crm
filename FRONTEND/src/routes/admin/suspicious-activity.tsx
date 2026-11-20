import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { SuspiciousActivityPage } from '@/features/suspicious/SuspiciousActivityPage'
import { validateSuspiciousSearch } from '@/features/suspicious/suspicious-search'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/suspicious-activity')({
  validateSearch: validateSuspiciousSearch,
  component: () => (
    <Can permission={P.tracking.reviewSuspicious} fallback={<NoAccess />}>
      <SuspiciousActivityPage />
    </Can>
  ),
})
