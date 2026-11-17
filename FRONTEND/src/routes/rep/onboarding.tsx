import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard'
import { isStepId, type StepId } from '@/features/onboarding/step-status'
import { P } from '@/lib/permissions'

interface OnboardingSearch {
  step?: StepId
}

export const Route = createFileRoute('/rep/onboarding')({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => ({
    step: isStepId(search.step) ? search.step : undefined,
  }),
  component: () => (
    <Can permission={P.tracking.report} fallback={<NoAccess />}>
      <OnboardingWizard />
    </Can>
  ),
})
