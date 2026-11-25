import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { RepDoctorsPage } from '@/features/doctors/RepDoctorsPage'
import type { DoctorsSearch } from '@/features/home/shortcuts'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/rep/doctors')({
  // Home shortcuts open a tab, or its "Add" sheet, directly.
  validateSearch: (search: Record<string, unknown>): DoctorsSearch => ({
    tab: search.tab === 'pharmacies' || search.tab === 'places' ? search.tab : undefined,
    add: search.add === true || search.add === 'true' ? true : undefined,
  }),
  component: () => (
    <Can permission={P.customers.read} fallback={<NoAccess />}>
      <RepDoctorsPage />
    </Can>
  ),
})
