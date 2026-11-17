import { createFileRoute } from '@tanstack/react-router'
import { TrackingHealthScreen } from '@/features/onboarding/TrackingHealthScreen'

export const Route = createFileRoute('/rep/tracking-health')({
  component: TrackingHealthScreen,
})
