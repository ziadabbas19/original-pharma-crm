import { Link, Outlet } from '@tanstack/react-router'
import {
  ActivityIcon,
  ClipboardListIcon,
  HomeIcon,
  ReceiptTextIcon,
  SettingsIcon,
  StethoscopeIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '@/components/BrandLogo'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
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

type RepPath =
  '/rep' | '/rep/doctors' | '/rep/visits' | '/rep/orders' | '/rep/tracking-health' | '/rep/settings'

const TABS: { to: RepPath; label: string; icon: LucideIcon; exact: boolean }[] = [
  { to: '/rep', label: 'nav.home', icon: HomeIcon, exact: true },
  { to: '/rep/doctors', label: 'nav.myDoctors', icon: StethoscopeIcon, exact: false },
  { to: '/rep/visits', label: 'nav.myVisits', icon: ClipboardListIcon, exact: false },
  { to: '/rep/orders', label: 'nav.myOrders', icon: ReceiptTextIcon, exact: false },
  { to: '/rep/tracking-health', label: 'nav.health', icon: ActivityIcon, exact: true },
  { to: '/rep/settings', label: 'nav.settings', icon: SettingsIcon, exact: true },
]

/** Mobile-first shell of the rep app (also used inside the Android app). */
export function RepLayout() {
  const { t } = useTranslation()
  const recheck = useTrackingHealthMonitor()
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
          <TrackingHealthBanner />
          <ActiveVisitBanner />
        </header>

        <main className="flex-1 p-4">
          <Outlet />
        </main>

        <nav
          className="sticky bottom-0 z-20 grid grid-cols-6 border-t bg-card pb-safe"
          aria-label={t('nav.menu')}
        >
          {TABS.map((tab) => {
            const dot =
              (tab.to === '/rep/tracking-health' && issues > 0) ||
              (tab.to === '/rep/orders' && waiting > 0) ||
              (tab.to === '/rep/visits' && visitsWaiting > 0)
            return (
              <Link
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: tab.exact }}
                className="relative flex min-w-0 flex-col items-center gap-1 px-0.5 py-2.5 text-[11px] leading-tight text-muted-foreground"
                activeProps={{ className: 'text-primary font-medium' }}
              >
                <tab.icon className="size-5" />
                <span className="max-w-full truncate">{t(tab.label)}</span>
                {dot && (
                  <span
                    className={
                      (tab.to === '/rep/orders' && outbox.failed.length === 0) ||
                      (tab.to === '/rep/visits' && visitsRefused === 0)
                        ? 'absolute top-2 size-2 rounded-full bg-warning ltr:ms-6 rtl:me-6'
                        : 'absolute top-2 size-2 rounded-full bg-destructive ltr:ms-6 rtl:me-6'
                    }
                  />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </RecheckContext.Provider>
  )
}
