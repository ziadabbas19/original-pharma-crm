import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { FlagsPage } from '@/features/flags/FlagsPage'
import { validateFlagsSearch } from '@/features/flags/flags-search'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/flags')({
  validateSearch: validateFlagsSearch,
  component: () => (
    <Can permission={P.tracking.reviewFlags} fallback={<NoAccess />}>
      <FlagsPage />
    </Can>
  ),
})
