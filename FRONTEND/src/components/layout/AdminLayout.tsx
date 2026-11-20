import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { LogOutIcon, MenuIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SmartphoneIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandLogo, BrandTile } from '@/components/BrandLogo'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { UserAvatar } from '@/components/UserAvatar'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { ProfileDialog } from '@/features/profile/ProfileDialog'
import { roleName } from '@/features/roles/role-rules'
import { useLiveTracking } from '@/features/tracking/useLiveTracking'
import { canUseDashboard, hasPermission, P } from '@/lib/permissions'
import { logout } from '@/lib/session'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { liveLocationsSelectors } from '@/store/slices/liveLocationsSlice'
import { sidebarCollapsedToggled, sidebarToggled } from '@/store/slices/uiSlice'
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
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed)
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
    <div className="flex min-h-dvh bg-background">
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      <Sheet open={open} onOpenChange={(value) => dispatch(sidebarToggled(value))}>
        <SheetContent
          side="start"
          className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">{t('nav.menu')}</SheetTitle>
          <SheetDescription className="sr-only">{t('nav.menuHint')}</SheetDescription>
          <SidebarContent onNavigate={() => dispatch(sidebarToggled(false))} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={t('nav.openMenu')}
            onClick={() => dispatch(sidebarToggled(true))}
          >
            <MenuIcon />
          </Button>
          <BrandLogo variant="emblem" className="size-7 md:hidden" decorative />
          <div className="min-w-0 flex-1 truncate font-medium md:hidden">
            {current ? t(current.label) : t('common.appName')}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            onClick={() => dispatch(sidebarCollapsedToggled())}
          >
            {collapsed ? (
              <PanelLeftOpenIcon className="rtl:-scale-x-100" />
            ) : (
              <PanelLeftCloseIcon className="rtl:-scale-x-100" />
            )}
          </Button>
          <div className="hidden flex-1 md:block" />
          <LiveConnectionIndicator />
          <NotificationBell to="/admin/notifications" />
          <ThemeSwitcher compact className="hidden sm:inline-flex" />
          <LanguageSwitcher />
          <UserChip />
          <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label={t('common.signOut')}>
            <LogOutIcon className="rtl:rotate-180" />
            <span className="hidden lg:inline">{t('common.signOut')}</span>
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6 [&>*]:animate-page-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { t } = useTranslation()
  const granted = useAppSelector((s) => s.permissions.byKey)

  const sections = ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || hasPermission(granted, item.permission)),
  })).filter((section) => section.items.length > 0)

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex shrink-0 items-center py-4', collapsed ? 'justify-center px-2' : 'px-4')}>
        {collapsed ? (
          <BrandTile variant="emblem" logoClassName="size-8" />
        ) : (
          <BrandTile className="w-full" logoClassName="h-10" />
        )}
      </div>
      <nav
        className={cn('flex-1 space-y-5 overflow-y-auto', collapsed ? 'p-2' : 'px-3 pb-3')}
        aria-label={t('nav.menu')}
      >
        {sections.map((section) => (
          <div key={section.title} className="space-y-1">
            {collapsed ? (
              <div className="mx-2 border-t border-sidebar-border first:hidden" aria-hidden />
            ) : (
              <p className="px-3 pb-1 text-xs font-semibold text-sidebar-muted">{t(section.title)}</p>
            )}
            {section.items.map((item) => (
              <NavLink key={item.to} item={item} onNavigate={onNavigate} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>
      {hasPermission(granted, P.tracking.report) && (
        <div className="border-t border-sidebar-border p-3">
          <Link
            to="/rep"
            onClick={onNavigate}
            title={collapsed ? t('nav.repApp') : undefined}
            className={cn(
              'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm text-sidebar-foreground/90 hover:bg-sidebar-hover',
              collapsed && 'justify-center px-0',
            )}
          >
            <SmartphoneIcon className="size-4 text-sidebar-icon" />
            <span className={cn(collapsed && 'sr-only')}>{t('nav.repApp')}</span>
          </Link>
        </div>
      )}
    </div>
  )
}

function NavLink({
  item,
  onNavigate,
  collapsed,
}: {
  item: AdminNavItem
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const { t } = useTranslation()
  const count = useNavBadge(item.badge)
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.to === '/admin' }}
      onClick={onNavigate}
      title={collapsed ? t(item.label) : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-sidebar-foreground/90 transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-active focus-visible:outline-none',
        collapsed && 'justify-center px-0',
      )}
      activeProps={{
        className:
          'bg-sidebar-active! font-semibold text-sidebar-active-foreground! shadow-card [&>svg]:text-sidebar-active-foreground!',
      }}
    >
      <item.icon className="size-[18px] shrink-0 text-sidebar-icon" />
      <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>{t(item.label)}</span>
      {count > 0 &&
        (collapsed ? (
          <span
            className="absolute top-1 size-2 rounded-full bg-destructive ltr:right-2 rtl:left-2"
            aria-hidden
          />
        ) : (
          <span className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-xs font-semibold text-destructive-foreground tabular-nums">
            {count}
          </span>
        ))}
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
  const { t } = useTranslation()
  const user = useAppSelector((s) => s.auth.user)
  const [open, setOpen] = useState(false)
  if (!user) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-2 rounded-md py-1 ps-1 pe-2 text-start hover:bg-accent"
        aria-label={t('profile.open')}
        title={t('profile.open')}
      >
        <UserAvatar name={user.fullName} src={user.avatarThumbnailUrl} />
        <div className="hidden min-w-0 leading-tight sm:block">
          <div className="max-w-40 truncate text-sm font-medium">{user.fullName}</div>
          {user.roles.length > 0 && (
            <div className="max-w-40 truncate text-xs text-muted-foreground">
              {user.roles.map(roleName).join(' · ')}
            </div>
          )}
        </div>
      </button>
      <ProfileDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
