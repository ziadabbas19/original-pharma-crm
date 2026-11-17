import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleStopIcon, InfoIcon, Loader2Icon, MapPinIcon, PlayIcon, ShieldAlertIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError } from '@/lib/api-client'
import { formatTime } from '@/lib/format'
import { platform } from '@/lib/platform'
import { useAppSelector } from '@/store'
import { endDay, startDay } from './tracking-service'

export function RepHomePage() {
  const { t } = useTranslation()
  const user = useAppSelector((s) => s.auth.user)
  const shift = useAppSelector((s) => s.tracking.shift)
  const ready = useAppSelector((s) => s.tracking.onboarding.completedAt !== null)
  const issues = useAppSelector((s) => s.tracking.healthIssues)
  const [busy, setBusy] = useState<'start' | 'end' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const isPwa = platform().kind === 'pwa'

  useEffect(() => {
    if (!shift) return
    const update = () =>
      void platform()
        .location.pendingCount()
        .then(setPending)
        .catch(() => {})
    update()
    const timer = window.setInterval(update, 30_000)
    return () => window.clearInterval(timer)
  }, [shift])

  const act = async (kind: 'start' | 'end') => {
    setBusy(kind)
    setError(null)
    try {
      await (kind === 'start' ? startDay() : endDay())
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic'
      setError(t([`rep.errors.${code}`, 'common.error']))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('rep.greeting', { name: user?.fullName ?? '' })}</h1>

      {!ready && (
        <Alert variant="warning">
          <ShieldAlertIcon />
          <AlertTitle>{t('rep.setupRequired')}</AlertTitle>
          <AlertDescription>
            <p>{t('rep.setupRequiredHint')}</p>
            <Button asChild size="sm" className="mt-2">
              <Link to="/rep/onboarding">{t('rep.openSetup')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinIcon className={shift ? 'size-5 text-success' : 'size-5 text-muted-foreground'} />
            {shift ? t('rep.dayRunning') : t('rep.dayNotStarted')}
          </CardTitle>
          {shift && (
            <CardDescription>{t('rep.startedAt', { time: formatTime(shift.startedAt) })}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {shift ? (
            <Button
              size="xl"
              variant="destructive"
              className="w-full"
              disabled={busy !== null}
              onClick={() => void act('end')}
            >
              {busy === 'end' ? <Loader2Icon className="animate-spin" /> : <CircleStopIcon />}
              {busy === 'end' ? t('rep.ending') : t('rep.endDay')}
            </Button>
          ) : (
            <Button
              size="xl"
              className="w-full"
              disabled={busy !== null || !ready || issues.length > 0}
              onClick={() => void act('start')}
            >
              {busy === 'start' ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
              {busy === 'start' ? t('rep.starting') : t('rep.startDay')}
            </Button>
          )}
          {shift && pending > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              {t('rep.pendingPoints', { count: pending })}
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {isPwa && (
        <Alert>
          <InfoIcon />
          <AlertDescription>{t('rep.pwaForegroundNote')}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
