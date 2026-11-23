import { Link } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart3Icon,
  ChevronRightIcon,
  CircleStopIcon,
  InfoIcon,
  Loader2Icon,
  PlayIcon,
  ShieldAlertIcon,
} from 'lucide-react'
import { BrandTile } from '@/components/BrandLogo'
import { FormError } from '@/components/states'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePermission } from '@/features/auth/usePermission'
import { HomeSection } from '@/features/home/HomeSections'
import { TodayAreaSheet } from '@/features/home/TodayAreaSheet'
import { useRepDay } from '@/features/home/use-rep-day'
import { WeekPlanHomeCard } from '@/features/plans/WeekPlanHomeCard'
import { useTodayPlan } from '@/features/home/use-today-plan'
import { useRepHomeConfig } from '@/features/home/use-rep-home'
import { enabledSections } from '@/features/settings/rep-home-config'
import { handleError, type AppError } from '@/lib/errors'
import { formatDate, formatTime } from '@/lib/format'
import { P } from '@/lib/permissions'
import { platform } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { collectionMode } from './collection'
import { useAppSelector } from '@/store'
import { endDay, startDay } from './tracking-service'

/**
 * Rep Home: the blue header with the working day, then the blocks the admin chose in Settings > Rep home,
 * in their order. Starting and ending the day is always here, whatever the layout.
 */
export function RepHomePage() {
  const { t } = useTranslation()
  const user = useAppSelector((s) => s.auth.user)
  const ready = useAppSelector((s) => s.tracking.onboarding.completedAt !== null)
  const config = useRepHomeConfig()
  const plan = useTodayPlan()
  const sections = enabledSections(config)
  const isPwa = platform().kind === 'pwa'
  const canSeeStats = usePermission(P.stats.read)
  const canPlan = usePermission(P.plans.readOwn)

  return (
    <div className="space-y-4">
      <RepHero name={user?.fullName ?? ''}>
        <DayControl />
      </RepHero>

      <div className="relative z-10 -mt-12 space-y-4" data-testid="home-sections">
        {!ready && (
          <Alert variant="warning" className="bg-card shadow-card">
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

        {sections.length === 0 && (
          <Card className="py-4">
            <CardContent className="px-5 text-sm text-muted-foreground">
              {t('repHome.noSections')}
            </CardContent>
          </Card>
        )}

        {sections.map((section, index) => (
          <HomeSection
            key={section}
            section={section}
            plan={plan}
            target={config.dailyVisitTarget}
            index={index}
          />
        ))}
      </div>

      {canPlan && <WeekPlanHomeCard />}

      {canSeeStats && (
        <Link to="/rep/statistics" className="block">
          <Card className="py-3 transition-colors hover:bg-accent/50">
            <CardContent className="flex items-center gap-3 px-4">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary-soft text-primary-soft-foreground">
                <BarChart3Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="flex-1 font-medium">{t('stats.mine')}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
            </CardContent>
          </Card>
        </Link>
      )}

      {isPwa && (
        <Alert>
          <InfoIcon />
          <AlertDescription>{t('rep.pwaForegroundNote')}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

/**
 * Start or end the working day, from the blue header. Starting first asks where the rep works today
 * (prefilled from the weekly plan); the choice is kept with the day on the server.
 */
function DayControl() {
  const { t } = useTranslation()
  const canVisit = usePermission(P.visits.create)
  const { setArea } = useRepDay()
  const [choosing, setChoosing] = useState(false)
  const shift = useAppSelector((s) => s.tracking.shift)
  const ready = useAppSelector((s) => s.tracking.onboarding.completedAt !== null)
  const issues = useAppSelector((s) => s.tracking.healthIssues)
  const untrusted = useAppSelector((s) => s.tracking.mockWatch.active)
  const configMode = useAppSelector((s) => s.tracking.config?.collectionMode)
  const visitOnly = (configMode ?? collectionMode()) === 'visitOnly'
  const [busy, setBusy] = useState<'start' | 'end' | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [pending, setPending] = useState(0)

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
      setError(handleError(e, { silent: true, context: kind === 'start' ? 'rep.startDay' : 'rep.endDay' }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 grid gap-2" data-testid="rep-day-card">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <span
              className={cn(
                'size-2.5 rounded-full ring-2 ring-primary-foreground/60',
                shift && untrusted ? 'bg-destructive' : shift ? 'bg-green' : 'bg-icon',
              )}
              aria-hidden
            />
            {shift ? t(visitOnly ? 'rep.dayRunningVisitOnly' : 'rep.dayRunning') : t('rep.dayNotStarted')}
          </p>
          {shift && <p className="opacity-90">{t('rep.startedAt', { time: formatTime(shift.startedAt) })}</p>}
        </div>
        {shift ? (
          <Button
            size="sm"
            variant="outline"
            className="border-primary-foreground/40 bg-transparent text-primary-foreground shadow-none hover:bg-primary-foreground/10 hover:text-primary-foreground"
            disabled={busy !== null}
            onClick={() => void act('end')}
          >
            {busy === 'end' ? <Loader2Icon className="animate-spin" /> : <CircleStopIcon />}
            {busy === 'end' ? t('rep.ending') : t('rep.endDay')}
          </Button>
        ) : (
          <Button
            size="lg"
            className="bg-tile text-primary hover:bg-tile/90"
            disabled={busy !== null || !ready || issues.length > 0}
            onClick={() => (canVisit ? setChoosing(true) : void act('start'))}
            data-testid="rep-start-day"
          >
            {busy === 'start' ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
            {busy === 'start' ? t('rep.starting') : t('rep.startDay')}
          </Button>
        )}
      </div>
      {shift && untrusted && (
        <p className="text-sm font-semibold" data-testid="tracking-untrusted">
          {t('integrity.mock.untrusted')}
        </p>
      )}
      {shift && pending > 0 && (
        <p className="text-xs opacity-90">{t('rep.pendingPoints', { count: pending })}</p>
      )}
      <FormError error={error} />
      {canVisit && (
        <TodayAreaSheet
          open={choosing}
          onOpenChange={setChoosing}
          confirmLabel={t('rep.startDay')}
          onConfirm={async (territoryId) => {
            await act('start')
            await setArea(territoryId)
          }}
        />
      )}
    </div>
  )
}

/** Blue header of the Home screen: greeting, today's date and the emblem on a white tile. */
export function RepHero({ name, children }: { name: string; children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <section
      className="-mx-4 -mt-4 rounded-b-[28px] bg-primary px-5 pt-6 pb-16 text-primary-foreground"
      data-testid="rep-hero"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm opacity-90">{formatDate(new Date().toISOString())}</p>
          <h1 className="truncate text-2xl font-bold">{t('rep.greeting', { name })}</h1>
        </div>
        <BrandTile variant="emblem" logoClassName="size-9" decorative />
      </div>
      {children}
    </section>
  )
}
