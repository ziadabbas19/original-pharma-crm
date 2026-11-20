import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/settings')({
  component: () => (
    <Can permission={P.settings.manage} fallback={<NoAccess />}>
      <SettingsPage />
    </Can>
  ),
})
