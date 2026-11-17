import { useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { CheckCircle2Icon, ExternalLinkIcon, Loader2Icon, PartyPopperIcon } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getTrackingGetConsentQueryKey,
  trackingPostTestPoint,
  trackingRecordConsent,
  useTrackingGetConsent,
} from '@/api/generated/endpoints'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { platform, type AppInfo } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { healthInspected, onboardingCompleted } from '@/store/slices/trackingSlice'
import { AllowAllTheTimeGuide, OemBatteryGuide } from './guides'
import { detectOem, evaluateHealth, reportHealth, STEP_FOR_ISSUE, type HealthIssueCode } from './health'
import { StatusIcon } from './StatusIcon'
import { StepCard } from './StepCard'
import {
  isStepId,
  readyForFinalCheck,
  STEP_IDS,
  stepStatus,
  type StepContext,
  type StepId,
} from './step-status'

const route = getRouteApi('/rep/onboarding')

interface FinalCheck {
  passed: boolean
  issues: HealthIssueCode[]
  serverOk: boolean
  consentOk: boolean
}

/**
 * "Tracking Setup": guided steps the rep completes once per phone before the
 * first "Start my day". Re-runnable from Settings; the health screen links
 * straight to a step with ?step=<id>.
 */
export function OnboardingWizard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const queryClient = useQueryClient()
  const { step } = route.useSearch()
  const p = platform()

  const health = useAppSelector((s) => s.tracking.health)
  const consent = useTrackingGetConsent()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const [mockCheck, setMockCheck] = useState<boolean | null | undefined>(undefined)
  const [finalCheck, setFinalCheck] = useState<FinalCheck | null>(null)
  const [finished, setFinished] = useState(false)

  const current: StepId = isStepId(step) ? step : 'consent'
  const index = STEP_IDS.indexOf(current)

  const refresh = useCallback(async () => {
    const h = await p.deviceHealth.inspect()
    dispatch(healthInspected({ health: h, issues: evaluateHealth(h, p.kind) }))
    return h
  }, [p, dispatch])

  // Re-check whenever the rep comes back from a system settings screen.
  useEffect(() => {
    void p.app.info().then(setInfo)
    void refresh()
    return p.app.onResume(() => void refresh())
  }, [p, refresh])

  const ctx: StepContext = {
    kind: p.kind,
    health,
    androidSdk: info?.androidSdk ?? null,
    consentAccepted: consent.data?.accepted,
    mockCheck,
    finalCheckPassed: finalCheck?.passed,
  }

  const goTo = (id: StepId) => void navigate({ to: '/rep/onboarding', search: { step: id }, replace: true })

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await action()
    } catch {
      // The status indicator shows the outcome; nothing else to report.
    } finally {
      await refresh().catch(() => undefined)
      setBusy(null)
    }
  }

  const acceptConsent = () =>
    run('consent', async () => {
      if (!info || !consent.data) return
      await trackingRecordConsent({
        consentVersion: consent.data.currentVersion,
        deviceId: info.deviceId,
        platform: info.platform,
        locale: i18n.resolvedLanguage ?? 'ar',
        clientAcceptedAt: new Date().toISOString(),
      })
      await queryClient.invalidateQueries({ queryKey: getTrackingGetConsentQueryKey() })
    })

  const checkMock = () => run('mock', async () => setMockCheck(await p.deviceHealth.checkMockLocation()))

  const runFinalCheck = () =>
    run('final', async () => {
      if (!info) return
      const h = await refresh()
      const issues = new Set(evaluateHealth(h, p.kind))

      if (p.kind === 'native') {
        const mock = await p.deviceHealth.checkMockLocation()
        setMockCheck(mock)
        if (mock) issues.add('mock-location')
      }

      let serverOk = false
      try {
        const fix = await p.location.getCurrentPosition({ timeoutMs: 20_000 })
        const result = await trackingPostTestPoint({
          deviceId: info.deviceId,
          source: p.kind === 'native' ? 'native' : 'pwa',
          sentAt: new Date().toISOString(),
          point: { ...fix, isMoving: null, uuid: crypto.randomUUID() },
        })
        serverOk = result.received
        if (result.signals.includes('mock-location')) issues.add('mock-location')
      } catch {
        // Offline or server error: serverOk stays false and the rep sees the retry hint.
      }

      const consentOk = (await consent.refetch()).data?.accepted === true
      setFinalCheck({
        passed: issues.size === 0 && serverOk && consentOk,
        issues: [...issues],
        serverOk,
        consentOk,
      })
    })

  const finish = () =>
    run('finish', async () => {
      if (!info) return
      const h = await refresh()
      const result = await reportHealth(h, info, 'onboarding', true)
      if (result.onboardingCompleted) {
        dispatch(onboardingCompleted(new Date().toISOString()))
        setFinished(true)
      } else {
        setFinalCheck((prev) => ({
          passed: false,
          issues: result.issues as HealthIssueCode[],
          serverOk: prev?.serverOk ?? false,
          consentOk: prev?.consentOk ?? false,
        }))
      }
    })

  if (finished) {
    return (
      <Card className="text-center">
        <CardHeader className="justify-items-center">
          <PartyPopperIcon className="size-10 text-primary" />
          <CardTitle className="text-xl">{t('onboarding.readyTitle')}</CardTitle>
          <CardDescription>{t('onboarding.readyText')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="w-full">
            <Link to="/rep">{t('onboarding.goHome')}</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const s = (id: StepId) => stepStatus(id, ctx)
  const k = (path: string) => t(`onboarding.steps.${current}.${path}`)
  const isBusy = (key: string) => busy === key
  const spinner = (key: string) => (isBusy(key) ? <Loader2Icon className="animate-spin" /> : null)

  const bodies: Record<StepId, ReactNode> = {
    consent: (
      <StepCard
        title={k('title')}
        why={k('why')}
        status={s('consent')}
        actions={
          consent.data?.accepted ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2Icon className="size-4" />
              {k('accepted')}
            </p>
          ) : (
            <Button
              size="lg"
              disabled={!agree || !consent.data || isBusy('consent')}
              onClick={() => void acceptConsent()}
            >
              {spinner('consent')}
              {k('accept')}
            </Button>
          )
        }
      >
        <dl className="space-y-3">
          {(['what', 'when', 'who', 'fake'] as const).map((part) => (
            <div key={part}>
              <dt className="font-medium">{k(`${part}Title`)}</dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{k(part)}</dd>
            </div>
          ))}
        </dl>
        {!consent.data?.accepted && (
          <label className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
            <span className="text-sm leading-relaxed">{k('checkbox')}</span>
          </label>
        )}
      </StepCard>
    ),

    locationWhileInUse: (
      <StepCard
        title={k('title')}
        why={k('why')}
        instructions={k('instructions')}
        status={s('locationWhileInUse')}
        actions={
          <Button
            size="lg"
            disabled={isBusy('whileInUse')}
            onClick={() => void run('whileInUse', () => p.deviceHealth.requestLocationWhileInUse())}
          >
            {spinner('whileInUse')}
            {k('action')}
          </Button>
        }
      />
    ),

    locationAlways: (
      <StepCard
        title={k('title')}
        why={k('why')}
        instructions={s('locationAlways') === 'notApplicable' ? undefined : k('instructions')}
        status={s('locationAlways')}
        actions={
          s('locationAlways') !== 'notApplicable' && (
            <>
              <Button
                size="lg"
                disabled={isBusy('always')}
                onClick={() => void run('always', () => p.deviceHealth.requestLocationAlways())}
              >
                {spinner('always')}
                {k('action')}
              </Button>
              {health && !health.preciseLocation && health.locationPermission !== 'none' && (
                <Button
                  variant="outline"
                  disabled={isBusy('precise')}
                  onClick={() => void run('precise', () => p.deviceHealth.requestPreciseLocation())}
                >
                  {k('preciseAction')}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => void run('settings', () => p.deviceHealth.openAppSettings())}
              >
                <ExternalLinkIcon />
                {k('openSettings')}
              </Button>
            </>
          )
        }
      >
        {s('locationAlways') !== 'notApplicable' && <AllowAllTheTimeGuide />}
      </StepCard>
    ),

    notifications: (
      <StepCard
        title={k('title')}
        why={k('why')}
        instructions={s('notifications') === 'notApplicable' ? undefined : k('instructions')}
        status={s('notifications')}
        actions={
          s('notifications') !== 'notApplicable' && (
            <>
              <Button
                size="lg"
                disabled={isBusy('notif')}
                onClick={() => void run('notif', () => p.push.requestPermission())}
              >
                {spinner('notif')}
                {k('action')}
              </Button>
              {s('notifications') === 'problem' && (
                <Button
                  variant="ghost"
                  onClick={() => void run('notifSettings', () => p.deviceHealth.openNotificationSettings())}
                >
                  <ExternalLinkIcon />
                  {k('openSettings')}
                </Button>
              )}
            </>
          )
        }
      />
    ),

    locationServices: (
      <StepCard
        title={k('title')}
        why={k('why')}
        instructions={k('instructions')}
        status={s('locationServices')}
        actions={
          p.kind === 'native' ? (
            <Button size="lg" onClick={() => void run('gps', () => p.deviceHealth.openLocationSettings())}>
              <ExternalLinkIcon />
              {k('action')}
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => void run('gps', () => p.deviceHealth.requestLocationWhileInUse())}
            >
              {t('onboarding.check')}
            </Button>
          )
        }
      />
    ),

    battery: (
      <StepCard
        title={k('title')}
        why={k('why')}
        instructions={p.kind === 'native' ? k('instructions') : undefined}
        status={s('battery')}
        actions={
          p.kind === 'native' && (
            <Button
              size="lg"
              disabled={isBusy('battery')}
              onClick={() => void run('battery', () => p.deviceHealth.requestIgnoreBatteryOptimizations())}
            >
              {spinner('battery')}
              {k('action')}
            </Button>
          )
        }
      >
        {p.kind === 'native' && (
          <OemBatteryGuide
            brand={detectOem(info?.manufacturer)}
            onOpenPowerSettings={() => void run('oem', () => p.deviceHealth.openOemPowerSettings())}
          />
        )}
      </StepCard>
    ),

    mockLocation: (
      <StepCard
        title={k('title')}
        why={k('why')}
        instructions={p.kind === 'native' ? k('instructions') : undefined}
        status={s('mockLocation')}
        actions={
          p.kind === 'native' && (
            <>
              <Button size="lg" disabled={isBusy('mock')} onClick={() => void checkMock()}>
                {spinner('mock')}
                {k('action')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void run('dev', () => p.deviceHealth.openDeveloperOptions())}
              >
                <ExternalLinkIcon />
                {k('devOptions')}
              </Button>
            </>
          )
        }
      >
        {mockCheck !== undefined && (
          <Alert variant={mockCheck === false ? 'success' : 'destructive'}>
            <AlertDescription>
              {mockCheck === false ? k('clean') : mockCheck ? k('detected') : k('unknown')}
            </AlertDescription>
          </Alert>
        )}
      </StepCard>
    ),

    healthCheck: (
      <StepCard
        title={k('title')}
        why={k('why')}
        instructions={k('instructions')}
        status={s('healthCheck')}
        actions={
          <>
            <Button
              size="lg"
              variant={finalCheck?.passed ? 'outline' : 'default'}
              disabled={isBusy('final') || !info}
              onClick={() => void runFinalCheck()}
            >
              {spinner('final')}
              {isBusy('final') ? k('running') : k('action')}
            </Button>
            {finalCheck?.passed && (
              <Button size="lg" disabled={isBusy('finish')} onClick={() => void finish()}>
                {spinner('finish')}
                {isBusy('finish') ? t('onboarding.finishing') : t('onboarding.finish')}
              </Button>
            )}
          </>
        }
      >
        {finalCheck && (
          <ul className="space-y-2">
            <ResultRow
              ok={finalCheck.consentOk}
              label={t('onboarding.steps.consent.title')}
              onFix={() => goTo('consent')}
            />
            {finalCheck.issues.map((issue) => (
              <ResultRow
                key={issue}
                ok={false}
                label={t(`health.issues.${issue}`)}
                onFix={() => goTo(STEP_FOR_ISSUE[issue] as StepId)}
              />
            ))}
            <ResultRow
              ok={finalCheck.serverOk}
              label={finalCheck.serverOk ? k('serverOk') : k('serverFailed')}
            />
            {finalCheck.passed && <p className="text-sm font-medium text-success">{k('allGood')}</p>}
          </ul>
        )}
        {!finalCheck && !readyForFinalCheck(ctx) && (
          <ul className="space-y-2">
            {STEP_IDS.filter((id) => id !== 'healthCheck' && ['pending', 'problem'].includes(s(id))).map(
              (id) => (
                <ResultRow
                  key={id}
                  ok={false}
                  label={t(`onboarding.steps.${id}.title`)}
                  onFix={() => goTo(id)}
                />
              ),
            )}
          </ul>
        )}
      </StepCard>
    ),
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{t('onboarding.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('onboarding.intro')}</p>
        <p className="text-xs font-medium text-muted-foreground">
          {t('onboarding.stepOf', { current: index + 1, total: STEP_IDS.length })}
        </p>
        <ol className="flex gap-1.5" aria-label={t('onboarding.title')}>
          {STEP_IDS.map((id, i) => {
            const status = s(id)
            return (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  onClick={() => goTo(id)}
                  aria-label={t(`onboarding.steps.${id}.title`)}
                  aria-current={i === index ? 'step' : undefined}
                  className={cn(
                    'h-2 w-full rounded-full transition-colors',
                    status === 'done' || status === 'notApplicable'
                      ? 'bg-success'
                      : status === 'problem'
                        ? 'bg-destructive'
                        : 'bg-muted',
                    i === index && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}
                />
              </li>
            )
          })}
        </ol>
      </div>

      {bodies[current]}

      <div className="flex justify-between gap-2">
        <Button variant="outline" disabled={index === 0} onClick={() => goTo(STEP_IDS[index - 1])}>
          {t('common.back')}
        </Button>
        {index < STEP_IDS.length - 1 && (
          <Button
            variant={s(current) === 'done' ? 'default' : 'secondary'}
            onClick={() => goTo(STEP_IDS[index + 1])}
          >
            {t('common.next')}
          </Button>
        )}
      </div>
    </div>
  )
}

function ResultRow({ ok, label, onFix }: { ok: boolean; label: string; onFix?: () => void }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
      <span className="flex items-center gap-2 text-sm">
        <StatusIcon status={ok ? 'done' : 'problem'} />
        {label}
      </span>
      {!ok && onFix && (
        <Button size="sm" variant="outline" onClick={onFix}>
          {t('common.fix')}
        </Button>
      )}
    </li>
  )
}
