import { CheckIcon, CopyIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUsersResetPassword } from '@/api/generated/endpoints'
import type { UserListItemDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Sets a generated temporary password for someone below you and shows it once. */
export function ResetPasswordDialog({ user, onClose }: { user: UserListItemDto; onClose: () => void }) {
  const { t } = useTranslation()
  const reset = useUsersResetPassword()
  const [password, setPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<unknown>(null)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('users.reset.title')}</DialogTitle>
          <DialogDescription>{t('users.reset.description', { name: user.fullName })}</DialogDescription>
        </DialogHeader>
        {password ? (
          <div className="grid gap-3">
            <Alert variant="success">
              <AlertDescription>{t('users.create.temporaryShownOnce')}</AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <code
                dir="ltr"
                className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-base select-all"
              >
                {password}
              </code>
              <Button
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(password).then(() => setCopied(true))}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? t('users.create.copied') : t('users.create.copy')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t('users.reset.after')}</p>
            <DialogFooter>
              <Button onClick={onClose}>{t('common.done')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm">{t('users.reset.warning')}</p>
            <FormError error={error} />
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                disabled={reset.isPending}
                onClick={async () => {
                  setError(null)
                  try {
                    setPassword((await reset.mutateAsync({ userId: user.id, data: {} })).temporaryPassword)
                  } catch (e) {
                    setError(e)
                  }
                }}
              >
                {reset.isPending && <Loader2Icon className="animate-spin" />}
                {t('users.reset.submit')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
