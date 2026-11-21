import { CheckIcon, RotateCcwIcon, Undo2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { plansApprove, plansReopen, plansReturn } from '@/api/generated/endpoints'
import type { WeeklyPlanDto } from '@/api/generated/model'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { handleError, type AppError } from '@/lib/errors'
import { formatWeekRange } from '@/lib/format'
import { PLAN_NOTE_MAX } from './plan-input'

export type ReviewMode = 'approve' | 'return' | 'reopen'

const ICON = { approve: CheckIcon, return: Undo2Icon, reopen: RotateCcwIcon }

/** Approve (optional note), return for changes (note required) or reopen an approved plan (optional note). */
export function ReviewPlanDialog({
  plan,
  mode,
  onDone,
  onConflict,
  onClose,
}: {
  plan: WeeklyPlanDto
  mode: ReviewMode
  onDone: (plan: WeeklyPlanDto) => void
  /** The plan changed meanwhile (someone else reviewed it, or the rep took it back): reload it. */
  onConflict?: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const required = mode === 'return'
  const missing = required && note.trim() === ''
  const Icon = ICON[mode]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (missing || note.length > PLAN_NOTE_MAX || !plan.id) return
    setBusy(true)
    setError(null)
    try {
      const body = { note: note.trim() || null, version: plan.version }
      const next =
        mode === 'approve'
          ? await plansApprove(plan.id, body)
          : mode === 'return'
            ? await plansReturn(plan.id, body)
            : await plansReopen(plan.id, body)
      onDone(next)
      onClose()
    } catch (err) {
      const e = handleError(err, { silent: true, context: `plans.${mode}` })
      setError(e)
      if (e.kind === 'conflict') onConflict?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="plan-review-dialog">
        <DialogHeader>
          <DialogTitle>{t(`plans.review.${mode}Title`)}</DialogTitle>
          <DialogDescription>
            {t(`plans.review.${mode}Text`, { name: plan.userName, week: formatWeekRange(plan.weekStart) })}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          <div className="grid gap-2">
            <Label htmlFor="plan-review-note">
              {t('plans.review.note')}{' '}
              <span className="text-muted-foreground">
                ({required ? t('plans.review.required') : t('common.optional')})
              </span>
            </Label>
            <Textarea
              id="plan-review-note"
              value={note}
              maxLength={PLAN_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              placeholder={required ? t('plans.review.returnPlaceholder') : undefined}
              aria-invalid={(touched && missing) || undefined}
              autoFocus={required}
            />
            <div className="flex items-start justify-between gap-2">
              {touched && missing ? (
                <p className="text-sm text-destructive" data-testid="plan-review-note-required">
                  {t('errors.plan_note_required')}
                </p>
              ) : (
                <span />
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                {note.length}/{PLAN_NOTE_MAX}
              </p>
            </div>
          </div>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant={mode === 'approve' ? 'default' : 'outline'}
              disabled={busy}
              data-testid="plan-review-confirm"
            >
              <Icon />
              {busy ? t('common.saving') : t(`plans.review.${mode}`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
