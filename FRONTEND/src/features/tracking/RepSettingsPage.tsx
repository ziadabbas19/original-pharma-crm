import { Link } from '@tanstack/react-router'
import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  CalendarCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MapPinIcon,
  NotebookPenIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { SignOutDialog } from '@/features/auth/SignOutDialog'
import { AvatarEditor } from '@/features/profile/AvatarEditor'
import { ChangePasswordForm } from '@/features/profile/ChangePasswordForm'
import { roleName } from '@/features/roles/role-rules'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { platform, type AppInfo } from '@/lib/platform'
import { usePermission } from '@/features/auth/usePermission'
import { useOrderOutbox } from '@/features/orders/order-outbox'
import { canUseDashboard, P, tracksLocation } from '@/lib/permissions'
import { accountStatus } from './account-status'
import { collectionMode } from './collection'
import { useAppSelector } from '@/store'

/** Rep settings menu, including the re-runnable "Tracking setup" entry. */
export function RepSettingsPage() {
  const { t, i18n } = useTranslation()
  const shift = useAppSelector((s) => s.tracking.shift)
  const user = useAppSelector((s) => s.auth.user)
  const issues = useAppSelector((s) => s.tracking.healthIssues)
  const checked = useAppSelector((s) => s.tracking.healthCheckedAt !== null)
  const status = accountStatus(issues, checked)
  const outbox = useOrderOutbox()
  const ordersWaiting = outbox.pending.length + outbox.failed.length
  const canSeeStats = usePermission(P.stats.read)
  const canPlan = usePermission(P.plans.readOwn)
  const granted = useAppSelector((s) => s.permissions.byKey)
  const tracks = tracksLocation(granted)
  const manages = canUseDashboard(granted)
  // Re-read when the server's config arrives (collectionMode falls back to the copy on the device).
  const configMode = useAppSelector((s) => s.tracking.config?.collectionMode)
  const visitOnly = (configMode ?? collectionMode()) === 'visitOnly'
  const [changingPassword, setChangingPassword] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeftIcon : ChevronRightIcon

  useEffect(() => {
    void platform().app.info().then(setInfo)
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('nav.account')}</h1>

      {user && (
        <Card className="gap-3 py-4" data-testid="account-profile">
          <CardContent className="grid gap-4 px-5">
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-section font-bold">{user.fullName}</p>
                <p className="truncate text-sm text-muted-foreground" dir="ltr">
                  {user.email}
                </p>
                {user.roles.length > 0 && (
                  <Badge className="mt-1">{user.roles.map(roleName).join(' · ')}</Badge>
                )}
              </div>
            </div>
            <AvatarEditor />
          </CardContent>
        </Card>
      )}

      {tracks && (
        <Card className="gap-0 py-0" data-testid="account-status">
          <StatusRow icon={MapPinIcon} label={t('settings.status.location')} state={status.location} />
          <Separator />
          <StatusRow
            icon={BellIcon}
            label={t('settings.status.notifications')}
            state={status.notifications}
          />
        </Card>
      )}

      {tracks && visitOnly && (
        <p
          className="flex items-start gap-2 px-1 text-sm text-muted-foreground"
          data-testid="visit-only-note"
        >
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-green-text" aria-hidden />
          {t('settings.visitOnlyNote')}
        </p>
      )}

      {tracks && (
        <Alert variant="info">
          <InfoIcon />
          <AlertDescription>{t('settings.status.note')}</AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0" data-testid="account-menu">
        {manages && (
          <>
            <MenuLink
              to="/admin"
              icon={LayoutDashboardIcon}
              title={t('nav.management')}
              hint={t('nav.managementHint')}
              chevron={Chevron}
            />
            <Separator />
          </>
        )}
        <MenuLink
          to="/rep/orders"
          icon={ReceiptTextIcon}
          title={t('nav.myOrders')}
          hint={
            ordersWaiting > 0
              ? t('settings.ordersWaiting', { count: ordersWaiting })
              : t('settings.ordersHint')
          }
          chevron={Chevron}
          attention={ordersWaiting > 0}
        />
        <Separator />
        <MenuLink
          to="/rep/notes"
          icon={NotebookPenIcon}
          title={t('notes.title')}
          hint={t('notes.menuHint')}
          chevron={Chevron}
        />
        {canPlan && (
          <>
            <Separator />
            <MenuLink
              to="/rep/plans"
              icon={CalendarCheckIcon}
              title={t('plans.myTitle')}
              hint={t('plans.menuHint')}
              chevron={Chevron}
            />
          </>
        )}
        {canSeeStats && (
          <>
            <Separator />
            <MenuLink
              to="/rep/statistics"
              icon={BarChart3Icon}
              title={t('stats.mine')}
              hint={t('settings.statsHint')}
              chevron={Chevron}
            />
          </>
        )}
        {tracks && (
          <>
            <Separator />
            <MenuLink
              to="/rep/onboarding"
              icon={WrenchIcon}
              title={t('settings.trackingSetup')}
              hint={t('settings.trackingSetupHint')}
              chevron={Chevron}
            />
            <Separator />
            <MenuLink
              to="/rep/tracking-health"
              icon={ActivityIcon}
              title={t('settings.trackingHealth')}
              hint={t('settings.trackingHealthHint')}
              chevron={Chevron}
              attention={issues.length > 0}
            />
          </>
        )}
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="flex items-center justify-between gap-3 px-5 py-3">
          <span>{t('theme.label')}</span>
          <ThemeSwitcher compact />
        </CardContent>
        <Separator />
        <CardContent className="flex items-center justify-between gap-3 px-5 py-3">
          <span>{t('settings.language')}</span>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardContent className="grid gap-3 px-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-medium">
              <KeyRoundIcon className="size-5 text-primary" />
              {t('password.title')}
            </span>
            {!changingPassword && (
              <Button size="sm" variant="outline" onClick={() => setChangingPassword(true)}>
                {t('password.change')}
              </Button>
            )}
          </div>
          {changingPassword && <ChangePasswordForm />}
        </CardContent>
      </Card>

      <Button
        variant="outlineDestructive"
        size="lg"
        className="w-full"
        disabled={shift !== null}
        onClick={() => setSigningOut(true)}
        data-testid="account-sign-out"
      >
        <LogOutIcon />
        {t('common.signOut')}
      </Button>
      {signingOut && <SignOutDialog onClose={() => setSigningOut(false)} />}

      {info && (
        <div className="space-y-1 text-center text-xs text-muted-foreground">
          <p>{t('settings.appVersion', { version: info.appVersion })}</p>
          <p dir="ltr">{[info.manufacturer, info.model, info.osVersion].filter(Boolean).join(' · ')}</p>
          <p dir="ltr">
            {t('settings.deviceId')}: {info.deviceId}
          </p>
        </div>
      )}
    </div>
  )
}

function StatusRow({
  icon: Icon,
  label,
  state,
}: {
  icon: LucideIcon
  label: string
  state: 'ok' | 'attention' | 'unknown'
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="flex-1 font-medium">{label}</span>
      <Badge variant={state === 'ok' ? 'success' : state === 'attention' ? 'warning' : 'secondary'}>
        {t(`settings.status.${state}`)}
      </Badge>
    </div>
  )
}

function MenuLink({
  to,
  icon: Icon,
  title,
  hint,
  chevron: Chevron,
  attention = false,
}: {
  to:
    | '/rep/onboarding'
    | '/rep/tracking-health'
    | '/rep/orders'
    | '/rep/statistics'
    | '/rep/plans'
    | '/rep/notes'
    | '/admin'
  icon: LucideIcon
  title: string
  hint: string
  chevron: LucideIcon
  /** A small amber dot: something here needs the rep. */
  attention?: boolean
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-5 py-4 hover:bg-accent">
      <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-[18px]" />
      </span>
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      {attention && <span className="size-2 rounded-full bg-warning" aria-hidden />}
      <Chevron className="size-4 text-muted-foreground" />
    </Link>
  )
}
