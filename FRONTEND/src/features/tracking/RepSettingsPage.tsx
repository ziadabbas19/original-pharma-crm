import { Link, useNavigate } from '@tanstack/react-router'
import {
  ActivityIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  LogOutIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { AvatarEditor } from '@/features/profile/AvatarEditor'
import { ChangePasswordForm } from '@/features/profile/ChangePasswordForm'
import { roleName } from '@/features/roles/role-rules'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { platform, type AppInfo } from '@/lib/platform'
import { logout } from '@/lib/session'
import { useAppSelector } from '@/store'

/** Rep settings menu, including the re-runnable "Tracking setup" entry. */
export function RepSettingsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const shift = useAppSelector((s) => s.tracking.shift)
  const user = useAppSelector((s) => s.auth.user)
  const [changingPassword, setChangingPassword] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeftIcon : ChevronRightIcon

  useEffect(() => {
    void platform().app.info().then(setInfo)
  }, [])

  const signOut = async () => {
    await logout()
    await navigate({ to: '/login' })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('settings.title')}</h1>

      {user && (
        <Card className="gap-3 py-4">
          <CardContent className="grid gap-3 px-5">
            <div>
              <p className="font-semibold">{user.fullName}</p>
              <p className="text-sm text-muted-foreground" dir="ltr">
                {user.email}
              </p>
              {user.roles.length > 0 && (
                <p className="text-xs text-muted-foreground">{user.roles.map(roleName).join(' · ')}</p>
              )}
            </div>
            <AvatarEditor />
          </CardContent>
        </Card>
      )}

      <Card className="gap-0 py-0">
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
        />
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

      <Button variant="outline" className="w-full" disabled={shift !== null} onClick={() => void signOut()}>
        <LogOutIcon />
        {t('common.signOut')}
      </Button>

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

function MenuLink({
  to,
  icon: Icon,
  title,
  hint,
  chevron: Chevron,
}: {
  to: '/rep/onboarding' | '/rep/tracking-health'
  icon: LucideIcon
  title: string
  hint: string
  chevron: LucideIcon
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-5 py-4 hover:bg-accent">
      <Icon className="size-5 text-primary" />
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <Chevron className="size-4 text-muted-foreground" />
    </Link>
  )
}
