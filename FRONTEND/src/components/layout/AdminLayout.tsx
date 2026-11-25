import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  ChevronRightIcon,
  ClipboardListIcon,
  HomeIcon,
  LayoutGridIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SmartphoneIcon,
  StethoscopeIcon,
  WifiOffIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandLogo, BrandTile } from '@/components/BrandLogo'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { UserAvatar } from '@/components/UserAvatar'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { ProfileDialog } from '@/features/profile/ProfileDialog'
import { roleName } from '@/features/roles/role-rules'
import { useLiveTracking } from '@/features/tracking/useLiveTracking'
import { startNoteSync } from '@/features/notes/note-outbox'
import { useNoteReminders } from '@/features/notes/use-notes'
import { useOnline } from '@/hooks/use-online'
import {
  canUseDashboard,
  canUseFieldApp,
  hasPermission,
  holdsForOwnWork,
  tracksLocation,
  P,
} from '@/lib/permissions'
import { logout } from '@/lib/session'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { liveLocationsSelectors } from '@/store/slices/liveLocationsSlice'
import { sidebarCollapsedToggled } from '@/store/slices/uiSlice'
import {
  ADMIN_NAV,
  allowedNav,
  isActivePath,
  phoneTabs,
  type AdminNavItem,
  type AdminPath,
} from './admin-nav'

/**
 * Management shell: persistent sidebar on wide screens; on phones a floating bottom bar with the four
 * most used pages and a full-screen More menu with everything else. Navigation is filtered by
 * permission and re-renders as soon as the grants change.
 */
export function AdminLayout() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed)
  const granted = useAppSelector((s) => s.permissions.byKey)
  const permissionsVersion = useAppSelector((s) => s.permissions.version)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [moreOpen, setMoreOpen] = useState(false)

  useLiveTracking()
  // Private notes: queued changes go out, reminders are scheduled on the phone and shown when they arrive.
  useEffect(() => startNoteSync(), [])
  useNoteReminders('admin')

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

  // The More menu is a phone affordance; close it when the viewport grows to the desktop layout.
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const onChange = () => media.matches && setMoreOpen(false)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const current = useMemo(
    () => ADMIN_NAV.flatMap((s) => s.items).find((item) => isActivePath(item, pathname)),
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-card/95 pt-safe backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 md:h-16 md:px-6">
            <BrandLogo variant="emblem" className="size-7 md:hidden" decorative />
            <div className="min-w-0 flex-1 truncate font-semibold md:hidden" data-testid="phone-title">
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
            <ThemeSwitcher compact className="hidden md:inline-flex" />
            <div className="hidden md:block">
              <LanguageSwitcher />
            </div>
            <div className="hidden md:block">
              <UserChip />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => void signOut()}
              aria-label={t('common.signOut')}
            >
              <LogOutIcon className="rtl:rotate-180" />
              <span className="hidden lg:inline">{t('common.signOut')}</span>
            </Button>
          </div>
          <OfflineNotice />
        </header>
        {/* Phones: bottom padding keeps the end of every page clear of the floating tab bar. */}
        <main className="min-w-0 flex-1 p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-6 [&>*]:animate-page-in">
          <Outlet />
        </main>
      </div>

      <PhoneTabBar pathname={pathname} onMore={() => setMoreOpen(true)} moreActive={moreOpen} />
      <MoreMenu
        open={moreOpen}
        onOpenChange={setMoreOpen}
        pathname={pathname}
        onSignOut={() => void signOut()}
      />
    </div>
  )
}

/** Shown under the header while the device is offline: the screen keeps the last loaded data. */
function OfflineNotice() {
  const { t } = useTranslation()
  const online = useOnline()
  if (online) return null
  return (
    <div
      className="flex items-center gap-2 border-t bg-warning-soft px-4 py-2 text-sm text-warning-soft-foreground"
      role="status"
      data-testid="offline-notice"
    >
      <WifiOffIcon className="size-4 shrink-0" aria-hidden />
      <span>{t('states.offlineManager')}</span>
    </div>
  )
}

/** Floating bottom bar on phones: the four most used pages this user may open, and More. */
function PhoneTabBar({
  pathname,
  onMore,
  moreActive,
}: {
  pathname: string
  onMore: () => void
  moreActive: boolean
}) {
  const { t } = useTranslation()
  const granted = useAppSelector((s) => s.permissions.byKey)
  const tabs = phoneTabs(granted)
  const inMore = !tabs.some((tab) => isActivePath(tab, pathname))
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
      aria-label={t('nav.menu')}
      data-testid="phone-tab-bar"
    >
      <div className="grid h-[68px] grid-cols-5 items-center gap-1 rounded-[26px] border bg-card px-2 shadow-float">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: tab.to === '/admin' }}
            className={TAB_CLASS}
            activeProps={{ className: TAB_ACTIVE }}
            data-testid={`tab-${tab.to}`}
          >
            <tab.icon className="size-[22px]" aria-hidden />
            <span className="max-w-full truncate">{t(tab.label)}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={onMore}
          className={cn(TAB_CLASS, (moreActive || inMore) && TAB_ACTIVE)}
          aria-haspopup="dialog"
          aria-expanded={moreActive}
          data-testid="tab-more"
        >
          <LayoutGridIcon className="size-[22px]" aria-hidden />
          <span className="max-w-full truncate">{t('nav.more')}</span>
        </button>
      </div>
    </nav>
  )
}

const TAB_CLASS =
  'group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[20px] px-1 py-1.5 text-[11px] leading-tight font-medium text-nav-inactive transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95'
const TAB_ACTIVE = 'bg-primary-soft font-semibold text-primary'

/**
 * Everything that is not in the bottom bar, full screen: the pages the user may open by section, their
 * own field work when they also work in the field, and account, display and sign-out.
 */
function MoreMenu({
  open,
  onOpenChange,
  pathname,
  onSignOut,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathname: string
  onSignOut: () => void
}) {
  const { t } = useTranslation()
  const granted = useAppSelector((s) => s.permissions.byKey)
  const user = useAppSelector((s) => s.auth.user)
  const [profileOpen, setProfileOpen] = useState(false)
  const inBar = new Set(phoneTabs(granted).map((tab) => tab.to))
  const sections = allowedNav(granted)
    .map((section) => ({ ...section, items: section.items.filter((item) => !inBar.has(item.to)) }))
    .filter((section) => section.items.length > 0)
  const close = () => onOpenChange(false)

  // Own field work of someone who also manages (not the admin, who holds everything at scope "all").
  const field: { to: '/rep' | '/rep/visits' | '/rep/doctors'; label: string; icon: LucideIcon }[] = [
    ...(tracksLocation(granted) ? [{ to: '/rep' as const, label: 'nav.home', icon: HomeIcon }] : []),
    ...(holdsForOwnWork(granted, P.visits.create)
      ? [{ to: '/rep/visits' as const, label: 'nav.myVisits', icon: ClipboardListIcon }]
      : []),
    ...(holdsForOwnWork(granted, P.customers.create)
      ? [{ to: '/rep/doctors' as const, label: 'nav.myDoctors', icon: StethoscopeIcon }]
      : []),
  ]

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-dvh max-h-dvh max-w-none gap-0 overflow-y-auto rounded-none border-0 pt-safe"
          data-testid="more-menu"
        >
          <SheetHeader className="border-b">
            <SheetTitle className="text-lg">{t('nav.more')}</SheetTitle>
            <SheetDescription className="sr-only">{t('nav.menuHint')}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 p-4">
            {user && (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="flex min-h-11 items-center gap-3 rounded-card border bg-background p-3 text-start"
              >
                <UserAvatar name={user.fullName} src={user.avatarThumbnailUrl} />
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-semibold">{user.fullName}</span>
                  {user.roles.length > 0 && (
                    <span className="truncate text-xs text-muted-foreground">
                      {user.roles.map(roleName).join(' · ')}
                    </span>
                  )}
                </span>
                <ChevronRightIcon className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
              </button>
            )}

            {sections.map((section) => (
              <MoreGroup key={section.title} title={t(section.title)}>
                {section.items.map((item) => (
                  <MoreLink
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={t(item.label)}
                    onClick={close}
                    active={isActivePath(item, pathname)}
                  />
                ))}
              </MoreGroup>
            ))}

            {field.length > 0 && (
              <MoreGroup title={t('nav.sections.myWork')}>
                {field.map((item) => (
                  <MoreLink
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={t(item.label)}
                    onClick={close}
                  />
                ))}
              </MoreGroup>
            )}

            <MoreGroup title={t('nav.display')}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <ThemeSwitcher />
                <LanguageSwitcher />
              </div>
            </MoreGroup>

            <Button variant="outlineDestructive" size="lg" onClick={onSignOut} data-testid="more-sign-out">
              <LogOutIcon className="rtl:rotate-180" />
              {t('common.signOut')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}

function MoreGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1" aria-label={title}>
      <h2 className="px-1 pb-1 text-xs font-semibold text-muted-foreground">{title}</h2>
      <div className="grid divide-y overflow-hidden rounded-card border bg-background">{children}</div>
    </section>
  )
}

function MoreLink({
  to,
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  to: AdminPath | '/rep' | '/rep/visits' | '/rep/doctors'
  icon: LucideIcon
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex min-h-12 items-center gap-3 px-3 text-sm font-medium transition-colors hover:bg-accent',
        active && 'bg-primary-soft text-primary',
      )}
      data-testid={`more-${to}`}
    >
      <Icon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      <ChevronRightIcon className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
    </Link>
  )
}

function SidebarContent({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { t } = useTranslation()
  const granted = useAppSelector((s) => s.permissions.byKey)

  const sections = allowedNav(granted)

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
      {canUseFieldApp(granted) && (
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
