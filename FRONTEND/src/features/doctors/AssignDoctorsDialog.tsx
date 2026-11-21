import { useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useDoctorsAssign } from '@/api/generated/endpoints'
import type { AssignDoctorsResult, AssignMode } from '@/api/generated/model'
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
import { NativeSelect } from '@/components/ui/native-select'
import { handleError, inlineErrors } from '@/lib/errors'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface RepOption {
  id: string
  name: string
}

/** Copy or move the selected doctors to another rep's list. */
export function AssignDoctorsDialog({
  doctorIds,
  reps,
  fromRepId,
  onClose,
  onDone,
}: {
  doctorIds: string[]
  reps: RepOption[]
  /** Pre-selected source list (the rep filter of the page). */
  fromRepId?: string
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const assign = useDoctorsAssign(inlineErrors)
  const [mode, setMode] = useState<AssignMode>(fromRepId ? 'move' : 'copy')
  const [from, setFrom] = useState(fromRepId ?? '')
  const [to, setTo] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<AssignDoctorsResult | null>(null)

  const problems = {
    to: to === '' ? t('forms.required') : to === from ? t('doctors.assign.sameRep') : undefined,
    from: mode === 'move' && from === '' ? t('doctors.assign.sourceRequired') : undefined,
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (problems.to || problems.from) return
    try {
      const done = await assign.mutateAsync({
        data: { doctorIds, toRepId: to, mode, fromRepId: from || null },
      })
      await queryClient.invalidateQueries({ queryKey: ['/api/doctors'] })
      setResult(done)
      onDone()
    } catch (err) {
      setError(handleError(err, { silent: true, context: 'doctors.assign' }))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('doctors.assign.title')}</DialogTitle>
          <DialogDescription>
            {t('doctors.assign.hint', { count: doctorIds.length, value: formatNumber(doctorIds.length) })}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="grid gap-3">
            <Alert variant="success">
              <AlertDescription>
                {t('doctors.assign.result', {
                  added: formatNumber(result.added),
                  already: formatNumber(result.alreadyOnList),
                  removed: formatNumber(result.removed),
                })}
              </AlertDescription>
            </Alert>
            {result.outsideAreaCount > 0 && (
              <Alert variant="warning">
                <AlertDescription>
                  {t('doctors.assign.outsideArea', { value: formatNumber(result.outsideAreaCount) })}
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button onClick={onClose}>{t('common.done')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
            <div
              className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
              role="radiogroup"
              aria-label={t('doctors.assign.mode')}
            >
              {(['copy', 'move'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'rounded-md py-1.5 text-sm font-medium text-muted-foreground',
                    mode === value && 'bg-background text-foreground shadow-xs',
                  )}
                >
                  {t(`doctors.assign.modes.${value}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t(`doctors.assign.modeHints.${mode}`)}</p>
            <div className="grid gap-2">
              <Label htmlFor="assign-from">{t('doctors.assign.from')}</Label>
              <NativeSelect
                id="assign-from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-invalid={touched && !!problems.from}
              >
                <option value="">
                  {mode === 'move' ? t('orders.form.choose') : t('doctors.assign.noSource')}
                </option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
              {touched && problems.from && <p className="text-sm text-destructive">{problems.from}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assign-to">{t('doctors.assign.to')}</Label>
              <NativeSelect
                id="assign-to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-invalid={touched && !!problems.to}
              >
                <option value="">{t('orders.form.choose')}</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
              {touched && problems.to && <p className="text-sm text-destructive">{problems.to}</p>}
            </div>
            <FormError error={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={assign.isPending}>
                {assign.isPending && <Loader2Icon className="animate-spin" />}
                {t(`doctors.assign.submit.${mode}`)}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
