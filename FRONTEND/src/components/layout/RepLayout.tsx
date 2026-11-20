import { Link, Outlet } from '@tanstack/react-router'
import { ClipboardListIcon, HomeIcon, StethoscopeIcon, UserRoundIcon, type LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '@/components/BrandLogo'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { MockLocationNotice } from '@/features/integrity/MockLocationNotice'
import { useLocationIntegrity } from '@/features/integrity/useLocationIntegrity'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { useOrderOutbox, startOrderSync } from '@/features/orders/order-outbox'
import { RecheckContext } from '@/features/onboarding/recheck-context'
import { TrackingHealthBanner } from '@/features/onboarding/TrackingHealthBanner'
import { useTrackingHealthMonitor } from '@/features/onboarding/useTrackingHealthMonitor'
import { useTrackingHub } from '@/features/tracking/useTrackingHub'
import { ActiveVisitBanner } from '@/features/visits/ActiveVisitBanner'
import { startVisitSync, useVisitOutbox } from '@/features/visits/visit-outbox'
import { useDocumentVisible } from '@/hooks/use-document-visible'
import { useAppSelector } from '@/store'

type RepPath = '/rep' | '/rep/visits' | '/rep/doctors' | '/rep/settings'

/** Four tabs; orders, statistics and tracking health are reached from Home and Account. */
const TABS: { to: RepPath; label: string; icon: LucideIcon; exact: boolean }[] = [
  { to: '/rep', label: 'nav.home', icon: HomeIcon, exact: true },
  { to: '/rep/visits', label: 'nav.myVisits', icon: ClipboardListIcon, exact: false },
  { to: '/rep/doctors', label: 'nav.myDoctors', icon: StethoscopeIcon, exact: false },
  { to: '/rep/settings', label: 'nav.account', icon: UserRoundIcon, exact: false },
]

/** Mobile-first shell of the rep app (also used inside the Android app). */
export function RepLayout() {
  const { t } = useTranslation()
  const recheck = useTrackingHealthMonitor()
  const integrity = useLocationIntegrity()
  const issues = useAppSelector((s) => s.tracking.healthIssues.length)
  const outbox = useOrderOutbox()
  const waiting = outbox.pending.length + outbox.failed.length
  const visitOutbox = useVisitOutbox()
  const visitsRefused = visitOutbox.failed.length + visitOutbox.failedSteps.length
  const visitsWaiting = visitOutbox.pending.length + visitOutbox.steps.length + visitsRefused

  // Queued orders and visit content go out as soon as there is network (and on return to the app).
  useEffect(() => startOrderSync(), [])
  useEffect(() => startVisitSync(), [])

  // Live notifications only while the app is on screen; the socket closes in the background.
  useTrackingHub(useDocumentVisible())

  // Orders waiting to be sent and tracking problems now live behind the Account tab.
  const accountDot = issues > 0 || waiting > 0
  const accountUrgent = issues > 0 || outbox.failed.length > 0

  return (
    <RecheckContext.Provider value={recheck}>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-background">
        <header className="sticky top-0 z-20 border-b bg-card/95 pt-safe backdrop-blur">
          <div className="flex h-14 items-center justify-between px-4">
            <BrandLogo className="h-9" />
            <div className="flex items-center gap-1">
              <NotificationBell to="/rep/notifications" />
              <LanguageSwitcher />
            </div>
          </div>
          <MockLocationNotice onCheckNow={integrity.checkNow} />
          <TrackingHealthBanner />
          <ActiveVisitBanner />
        </header>

        {/* Bottom padding keeps the end of every page clear of the floating tab bar; each page fades in as it mounts. */}
        <main className="flex-1 p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] [&>*]:animate-page-in">
          <Outlet />
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          aria-label={t('nav.menu')}
        >
          <div className="grid h-[68px] grid-cols-4 items-center gap-1 rounded-[26px] border bg-card px-2 shadow-float">
            {TABS.map((tab) => {
              const dot =
                (tab.to === '/rep/visits' && visitsWaiting > 0) || (tab.to === '/rep/settings' && accountDot)
              const urgent =
                (tab.to === '/rep/visits' && visitsRefused > 0) ||
                (tab.to === '/rep/settings' && accountUrgent)
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  activeOptions={{ exact: tab.exact }}
                  className="group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1 py-1.5 text-[11px] leading-tight font-medium text-nav-inactive transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95"
                  activeProps={{ className: 'bg-primary-soft font-semibold text-primary' }}
                  data-testid={`nav-${tab.to.replace('/rep', '').replace('/', '') || 'home'}`}
                >
                  <tab.icon className="size-[22px]" aria-hidden />
                  <span className="max-w-full truncate">{t(tab.label)}</span>
                  {dot && (
                    <span
                      className={
                        urgent
                          ? 'absolute top-1.5 size-2 rounded-full bg-destructive ltr:ms-7 rtl:me-7'
                          : 'absolute top-1.5 size-2 rounded-full bg-warning ltr:ms-7 rtl:me-7'
                      }
                      aria-hidden
                    />
                  )}
                  {dot && <span className="sr-only">{t('nav.needsAttention')}</span>}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </RecheckContext.Provider>
  )
}
