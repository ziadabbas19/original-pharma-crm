import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { LogOutIcon, MenuIcon, SmartphoneIcon } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { roleName } from '@/features/roles/role-rules'
import { useLiveTracking } from '@/features/tracking/useLiveTracking'
import { canUseDashboard, hasPermission, P } from '@/lib/permissions'
import { logout } from '@/lib/session'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { liveLocationsSelectors } from '@/store/slices/liveLocationsSlice'
import { sidebarToggled } from '@/store/slices/uiSlice'
import { ADMIN_NAV, type AdminNavItem } from './admin-nav'

/**
 * Dashboard shell: persistent sidebar on desktop, drawer on phones. Navigation
 * is filtered by permission and re-renders as soon as the grants change.
 */
export function AdminLayout() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const open = useAppSelector((s) => s.ui.sidebarOpen)
  const granted = useAppSelector((s) => s.permissions.byKey)
  const permissionsVersion = useAppSelector((s) => s.permissions.version)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useLiveTracking()

  // Grants changed on the server (X-Permissions-Version): refetch everything so lists follow the new scope,
  // and leave the dashboard if it is no longer allowed.
  const seenVersion = useRef(permissionsVersion)
  useEffect(() => {
    if (seenVersion.current === permissionsVersion) return
    seenVersion.current = permissionsVersion
    void queryClient.invalidateQueries()
  }, [permissionsVersion, queryClient])

  const allowed = canUseDashboard(granted)
  useEffect(() => {
    if (!allowed) void navigate({ to: '/rep' })
  }, [allowed, navigate])

  // The drawer is a phone affordance; close it when the viewport grows to the desktop layout.
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const onChange = () => media.matches && dispatch(sidebarToggled(false))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [dispatch])

  const current = useMemo(
    () =>
      ADMIN_NAV.flatMap((s) => s.items).find((item) =>
        item.to === '/admin' ? pathname === '/admin' || pathname === '/admin/' : pathname.startsWith(item.to),
      ),
    [pathname],
  )

  const signOut = async () => {
    await logout()
    await navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-dvh bg-muted/30">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e bg-card md:flex">
        <SidebarContent />
      </aside>

      <Sheet open={open} onOpenChange={(value) => dispatch(sidebarToggled(value))}>
        <SheetContent side="start" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
          <SheetDescription className="sr-only">{t('nav.menuHint')}</SheetDescription>
          <SidebarContent onNavigate={() => dispatch(sidebarToggled(false))} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t('nav.openMenu')}
            onClick={() => dispatch(sidebarToggled(true))}
          >
            <MenuIcon />
          </Button>
          <div className="min-w-0 flex-1 truncate font-medium md:hidden">
            {current ? t(current.label) : t('common.appName')}
          </div>
          <div className="hidden flex-1 md:block" />
          <LiveConnectionIndicator />
          <LanguageSwitcher />
          <UserChip />
          <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label={t('common.signOut')}>
            <LogOutIcon className="rtl:rotate-180" />
            <span className="hidden lg:inline">{t('common.signOut')}</span>
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const granted = useAppSelector((s) => s.permissions.byKey)

  const sections = ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || hasPermission(granted, item.permission)),
  })).filter((section) => section.items.length > 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4 font-semibold">
        <img src="/favicon.svg" alt="" className="size-7" />
        {t('common.appName')}
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto p-3" aria-label={t('nav.menu')}>
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            <p className="px-3 text-xs font-medium text-muted-foreground/80">{t(section.title)}</p>
            {section.items.map((item) => (
              <NavLink key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      {hasPermission(granted, P.tracking.report) && (
        <div className="border-t p-3">
          <Link
            to="/rep"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <SmartphoneIcon className="size-4" />
            {t('nav.repApp')}
          </Link>
        </div>
      )}
    </div>
  )
}

function NavLink({ item, onNavigate }: { item: AdminNavItem; onNavigate?: () => void }) {
  const { t } = useTranslation()
  const count = useNavBadge(item.badge)
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/admin' }}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      activeProps={{ className: 'bg-accent font-medium text-accent-foreground' }}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{t(item.label)}</span>
      {count > 0 && (
        <span className="min-w-5 rounded-full bg-destructive/15 px-1.5 text-center text-xs font-medium text-destructive tabular-nums">
          {count}
        </span>
      )}
    </Link>
  )
}

/** Counters from the live presence data (only available with tracking:view-live). */
function useNavBadge(badge: AdminNavItem['badge']): number {
  return useAppSelector((s) => {
    if (!badge) return 0
    const reps = liveLocationsSelectors.selectAll(s.liveLocations)
    return badge === 'openFlags'
      ? reps.reduce((sum, r) => sum + r.openFlags, 0)
      : reps.filter((r) => !r.deviceHealthy).length
  })
}

function LiveConnectionIndicator() {
  const { t } = useTranslation()
  const canViewLive = useAppSelector((s) => hasPermission(s.permissions.byKey, P.tracking.viewLive))
  const connected = useAppSelector((s) => s.liveLocations.connected)
  if (!canViewLive) return null
  const label = connected ? t('liveMap.connected') : t('liveMap.disconnected')
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border px-2 py-1 text-xs text-muted-foreground sm:inline-flex"
      title={label}
    >
      <span className={cn('size-2 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/50')} />
      <span className="hidden xl:inline">{label}</span>
      <span className="sr-only xl:hidden">{label}</span>
    </span>
  )
}

function UserChip() {
  const user = useAppSelector((s) => s.auth.user)
  if (!user) return null
  const initials = user.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
  return (
    <div className="flex min-w-0 items-center gap-2 ps-1">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary uppercase"
        aria-hidden
      >
        {initials}
      </span>
      <div className="hidden min-w-0 leading-tight sm:block">
        <div className="max-w-40 truncate text-sm font-medium">{user.fullName}</div>
        {user.roles.length > 0 && (
          <div className="max-w-40 truncate text-xs text-muted-foreground">
            {user.roles.map(roleName).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}
