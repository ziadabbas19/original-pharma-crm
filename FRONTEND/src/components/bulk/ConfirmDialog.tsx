import { Loader2Icon, TriangleAlertIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** A plain destructive confirmation (remove a picture, cancel orders): title, one sentence, cancel and confirm. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  children,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  confirmLabel: string
  children?: ReactNode
  onConfirm: () => Promise<void> | void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="confirm-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlertIcon className="size-5 shrink-0 text-destructive" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <FormError error={error} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void confirm()}
            data-testid="confirm-yes"
          >
            {busy && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
