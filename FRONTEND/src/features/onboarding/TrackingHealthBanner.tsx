import { Link } from '@tanstack/react-router'
import { AlertTriangleIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAppSelector } from '@/store'

/** Shown across the rep app when a check fails after setup (permission revoked, GPS off, ...). */
export function TrackingHealthBanner() {
  const { t } = useTranslation()
  const allIssues = useAppSelector((s) => s.tracking.healthIssues)
  const completed = useAppSelector((s) => s.tracking.onboarding.completedAt)
  const mockNoticeShown = useAppSelector((s) => s.tracking.mockWatch.active)
  // The fake location notice above already says it, in both languages.
  const issues = mockNoticeShown ? allIssues.filter((i) => i !== 'mock-location') : allIssues

  if (!completed || issues.length === 0) return null

  return (
    <Alert
      variant="warning"
      className="rounded-none border-x-0 border-t-0"
      data-testid="tracking-health-banner"
    >
      <AlertTriangleIcon />
      <AlertTitle>{t('health.banner')}</AlertTitle>
      <AlertDescription>
        <p>{t(`health.issues.${issues[0]}`)}</p>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link to="/rep/tracking-health">{t('health.bannerAction')}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
