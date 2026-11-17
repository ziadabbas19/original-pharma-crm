import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { AvatarEditor } from './AvatarEditor'
import { ChangePasswordForm } from './ChangePasswordForm'

/** Own profile from the dashboard top bar: picture, theme and password. */
export function ProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('profile.title')}</DialogTitle>
          <DialogDescription>{t('profile.hint')}</DialogDescription>
        </DialogHeader>
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">{t('profile.picture')}</h3>
          <AvatarEditor />
        </section>
        <Separator />
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">{t('theme.label')}</h3>
          <ThemeSwitcher />
        </section>
        <Separator />
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">{t('password.title')}</h3>
          <ChangePasswordForm />
        </section>
      </DialogContent>
    </Dialog>
  )
}
