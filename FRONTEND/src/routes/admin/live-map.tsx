import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { LiveMapPage } from '@/features/tracking/live-map/LiveMapPage'
import { validateLiveMapSearch } from '@/features/tracking/live-map/live-map-search'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/live-map')({
  validateSearch: validateLiveMapSearch,
  component: () => (
    <Can permission={P.tracking.viewLive} fallback={<NoAccess />}>
      <LiveMapPage />
    </Can>
  ),
})
