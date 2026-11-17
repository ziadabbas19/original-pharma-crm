import { Link, Outlet } from '@tanstack/react-router'
import { ActivityIcon, HomeIcon, SettingsIcon, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { RecheckContext } from '@/features/onboarding/recheck-context'
import { TrackingHealthBanner } from '@/features/onboarding/TrackingHealthBanner'
import { useTrackingHealthMonitor } from '@/features/onboarding/useTrackingHealthMonitor'
import { useAppSelector } from '@/store'

const TABS: { to: '/rep' | '/rep/tracking-health' | '/rep/settings'; label: string; icon: LucideIcon }[] = [
  { to: '/rep', label: 'nav.home', icon: HomeIcon },
  { to: '/rep/tracking-health', label: 'nav.trackingHealth', icon: ActivityIcon },
  { to: '/rep/settings', label: 'nav.settings', icon: SettingsIcon },
]

/** Mobile-first shell of the rep app (also used inside the Android app). */
export function RepLayout() {
  const { t } = useTranslation()
  const recheck = useTrackingHealthMonitor()
  const issues = useAppSelector((s) => s.tracking.healthIssues.length)

  return (
    <RecheckContext.Provider value={recheck}>
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-background">
        <header className="sticky top-0 z-20 border-b bg-card/95 pt-safe backdrop-blur">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2 font-semibold">
              <img src="/favicon.svg" alt="" className="size-7" />
              {t('common.appName')}
            </div>
            <LanguageSwitcher />
          </div>
          <TrackingHealthBanner />
        </header>

        <main className="flex-1 p-4">
          <Outlet />
        </main>

        <nav className="sticky bottom-0 z-20 grid grid-cols-3 border-t bg-card pb-safe">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: true }}
              className="relative flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground"
              activeProps={{ className: 'text-primary font-medium' }}
            >
              <tab.icon className="size-5" />
              {t(tab.label)}
              {tab.to === '/rep/tracking-health' && issues > 0 && (
                <span className="absolute top-2 size-2 rounded-full bg-destructive ltr:ms-6 rtl:me-6" />
              )}
            </Link>
          ))}
        </nav>
      </div>
    </RecheckContext.Provider>
  )
}
