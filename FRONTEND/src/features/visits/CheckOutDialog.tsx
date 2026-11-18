import { CheckCircle2Icon, Loader2Icon, LocateOffIcon, LocateFixedIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDistance, localizedName } from '@/lib/format'
import type { GeoFix } from '@/lib/platform'
import { checkOutVisit, type ActiveVisit } from './active-visit'
import { captureVisitFix } from './visit-checkin'

/**
 * Confirms the check-out and takes a last location. Without a fix the rep can still close the visit: it
 * goes to the supervisor for review instead of keeping the rep stuck. `explain` asks why it is late.
 */
export function CheckOutDialog({
  visit,
  explain = false,
  onClose,
  onConfirm,
  onDone,
}: {
  visit: ActiveVisit
  explain?: boolean
  onClose: () => void
  /** Right before the visit closes on this device. */
  onConfirm?: () => void | Promise<void>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [fix, setFix] = useState<GeoFix | null>(null)
  const [locating, setLocating] = useState(true)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let active = true
    captureVisitFix()
      .then((value) => active && setFix(value))
      .catch(() => {})
      .finally(() => active && setLocating(false))
    return () => {
      active = false
    }
  }, [])

  const noteMissing = explain && notes.trim() === ''

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm?.()
      await checkOutVisit(visit, { fix, notes })
      onDone()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent data-testid="check-out-dialog">
        <DialogHeader>
          <DialogTitle>
            {t(explain ? 'visits.checkOutFlow.lateTitle' : 'visits.checkOutFlow.title')}
          </DialogTitle>
          <DialogDescription>
            {t('visits.checkOutFlow.body', {
              customer: localizedName(visit.customer.name, visit.customer.nameAr),
            })}
          </DialogDescription>
        </DialogHeader>

        {locating ? (
          <p className="flex items-center gap-2 text-sm" role="status" aria-live="polite">
            <LocateFixedIcon className="size-4 animate-pulse text-primary" aria-hidden />
            {t('visits.checkInFlow.locating')}
          </p>
        ) : fix ? (
          <p className="flex items-center gap-2 text-sm" data-testid="check-out-located">
            <CheckCircle2Icon className="size-4 text-success" aria-hidden />
            {t('visits.checkOutFlow.located', { accuracy: formatDistance(Math.round(fix.accuracy)) })}
          </p>
        ) : (
          <Alert variant="warning" data-testid="check-out-no-location">
            <LocateOffIcon />
            <AlertDescription>{t('visits.checkOutFlow.noLocation')}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <Label htmlFor="check-out-notes">
            {t(explain ? 'visits.checkOutFlow.reason' : 'visits.checkOutFlow.notes')}
          </Label>
          <Textarea
            id="check-out-notes"
            rows={3}
            maxLength={2000}
            value={notes}
            aria-required={explain}
            placeholder={t(
              explain ? 'visits.checkOutFlow.reasonPlaceholder' : 'visits.checkOutFlow.notesPlaceholder',
            )}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <FormError error={error} />

        <DialogFooter>
          <Button variant="outline" size="lg" disabled={busy} onClick={onClose}>
            {t('common.back')}
          </Button>
          <Button
            size="lg"
            disabled={busy || locating || noteMissing}
            onClick={() => void confirm()}
            data-testid="check-out-confirm"
          >
            {busy && <Loader2Icon className="animate-spin" />}
            {t('visits.checkOutFlow.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
