import { createFileRoute } from '@tanstack/react-router'
import { RepSettingsPage } from '@/features/tracking/RepSettingsPage'

export const Route = createFileRoute('/rep/settings')({
  component: RepSettingsPage,
})
