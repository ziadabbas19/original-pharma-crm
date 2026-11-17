import { Link } from '@tanstack/react-router'
import { RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrackingGetConsent } from '@/api/generated/endpoints'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelative } from '@/lib/format'
import { platform } from '@/lib/platform'
import { useAppSelector } from '@/store'
import { useRecheckHealth } from './recheck-context'
import { StatusIcon } from './StatusIcon'
import { STEP_IDS, stepStatus } from './step-status'

/**
 * Same checks as the setup wizard, re-run on demand. Each failing check links
 * to the wizard step that fixes it.
 */
export function TrackingHealthScreen() {
  const { t } = useTranslation()
  const onRecheck = useRecheckHealth()
  const health = useAppSelector((s) => s.tracking.health)
  const issues = useAppSelector((s) => s.tracking.healthIssues)
  const checkedAt = useAppSelector((s) => s.tracking.healthCheckedAt)
  const consent = useTrackingGetConsent()
  const [checking, setChecking] = useState(false)
  const kind = platform().kind

  const recheck = async () => {
    setChecking(true)
    try {
      await onRecheck()
      await consent.refetch()
    } finally {
      setChecking(false)
    }
  }

  const ctx = {
    kind,
    health,
    androidSdk: null,
    consentAccepted: consent.data?.accepted,
    mockCheck: health ? health.mockLocationDetected : undefined,
    finalCheckPassed: undefined,
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t('health.title')}</h1>
        <Button variant="outline" size="sm" disabled={checking} onClick={() => void recheck()}>
          <RefreshCwIcon className={checking ? 'animate-spin' : undefined} />
          {t('health.recheck')}
        </Button>
      </div>
      {checkedAt && (
        <p className="text-xs text-muted-foreground">
          {t('health.lastChecked', { time: formatRelative(checkedAt) })}
        </p>
      )}

      <Alert variant={issues.length === 0 ? 'success' : 'warning'}>
        <AlertDescription>
          {issues.length === 0 ? (
            t('health.allGood')
          ) : (
            <>
              <p>{t('health.problems')}</p>
              <ul className="list-disc ps-5">
                {issues.map((issue) => (
                  <li key={issue}>{t(`health.issues.${issue}`)}</li>
                ))}
              </ul>
            </>
          )}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t('nav.trackingSetup')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {STEP_IDS.filter((id) => id !== 'healthCheck').map((id) => {
            const status = stepStatus(id, ctx)
            return (
              <div key={id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <StatusIcon status={status} />
                  {t(`onboarding.steps.${id}.title`)}
                </span>
                {(status === 'problem' || status === 'pending') && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/rep/onboarding" search={{ step: id }}>
                      {t('common.fix')}
                    </Link>
                  </Button>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
