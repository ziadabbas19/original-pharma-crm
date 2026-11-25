import { useNavigate } from '@tanstack/react-router'
import { KeyRoundIcon, LogOutIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandLogo } from '@/components/BrandLogo'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SignOutDialog } from '@/features/auth/SignOutDialog'
import { useAppSelector } from '@/store'
import { ChangePasswordForm } from './ChangePasswordForm'

export function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const mustChange = useAppSelector((s) => s.auth.user?.mustChangePassword ?? false)
  const [signingOut, setSigningOut] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 p-4 pt-safe pb-safe">
      <div className="flex w-full max-w-sm items-center justify-between gap-2">
        <BrandLogo className="h-12" />
        <div className="flex items-center gap-1">
          <ThemeSwitcher compact />
          <LanguageSwitcher />
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <KeyRoundIcon className="size-5 text-primary" />
            {t('password.title')}
          </CardTitle>
          <CardDescription>{mustChange ? t('password.mustChangeHint') : t('password.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {mustChange && (
            <Alert variant="warning">
              <AlertDescription>{t('password.temporary')}</AlertDescription>
            </Alert>
          )}
          <ChangePasswordForm onDone={() => void navigate({ to: '/' })} />
          <Button variant="ghost" size="sm" onClick={() => setSigningOut(true)}>
            <LogOutIcon className="rtl:rotate-180" />
            {t('common.signOut')}
          </Button>
          {signingOut && <SignOutDialog onClose={() => setSigningOut(false)} />}
        </CardContent>
      </Card>
    </div>
  )
}
