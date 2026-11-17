import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { DevicesPage } from '@/features/devices/DevicesPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/devices')({
  component: () => (
    <Can permission={P.devices.read} fallback={<NoAccess />}>
      <DevicesPage />
    </Can>
  ),
})
