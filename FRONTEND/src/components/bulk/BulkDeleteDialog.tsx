import { ArchiveIcon, Loader2Icon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BulkDeleteRequest, BulkResult } from '@/api/generated/model'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNumber } from '@/lib/format'
import { BulkProgressBar } from './BulkProgressBar'
import { BulkResultSummary } from './BulkResultSummary'
import type { BulkProgress } from './run-in-batches'

/** Above this many items a delete needs the typed confirmation word. */
const TYPE_TO_CONFIRM_ABOVE = 10

/** Words accepted as the typed confirmation, in both languages. */
const CONFIRM_WORDS = ['delete', 'حذف']

export type DeleteVerb = 'delete' | 'remove' | 'discard'

export interface BulkDeleteDialogProps {
  ids: string[]
  /** Display name of an item: the title names it when there is one, blocked rows list it. */
  nameOf: (id: string) => string
  /** One sentence on what deleting means here, e.g. "Its products stay without a line." */
  consequence: string
  /** Users and roles: always ask for the typed word. More than 10 items always do. */
  dangerous?: boolean
  /** The delete request. Called with dryRun first (when `preview` is on) to show what will happen. */
  run: (request: BulkDeleteRequest, onProgress?: (progress: BulkProgress) => void) => Promise<BulkResult>
  preview?: boolean
  verb?: DeleteVerb
  /** Called after the real request; keep the blocked rows selected from here. */
  onDone?: (result: BulkResult) => void
  onClose: () => void
}

type Phase = 'checking' | 'confirm' | 'working' | 'done'

/**
 * The one confirmation every delete goes through, single or bulk, in the dashboard and the rep app.
 * It names the item (or gives the count), says what will happen (removed, archived because other
 * records use it, or refused and why), asks for the typed word on dangerous deletes, and shows the
 * per-item result at the end.
 */
export function BulkDeleteDialog({
  ids,
  nameOf,
  consequence,
  dangerous = false,
  run,
  preview = true,
  verb = 'delete',
  onDone,
  onClose,
}: BulkDeleteDialogProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [phase, setPhase] = useState<Phase>(preview ? 'checking' : 'confirm')
  const [forecast, setForecast] = useState<BulkResult | null>(null)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [typed, setTyped] = useState('')
  const [progress, setProgress] = useState<BulkProgress | null>(null)

  const single = ids.length === 1
  const needsWord = dangerous || ids.length > TYPE_TO_CONFIRM_ABOVE
  const wordOk = CONFIRM_WORDS.includes(typed.trim().toLowerCase())
  const actionable = forecast ? forecast.items.length - forecast.blocked : ids.length

  useEffect(() => {
    if (!preview) return
    let active = true
    run({ ids, dryRun: true })
      .then((r) => active && setForecast(r))
      .catch((e: unknown) => active && setError(e))
      .finally(() => active && setPhase('confirm'))
    return () => {
      active = false
    }
    // The ids of one dialog never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confirm = async () => {
    setPhase('working')
    setError(null)
    setProgress(null)
    try {
      const done = await run({ ids, dryRun: false }, setProgress)
      setResult(done)
      setPhase('done')
      onDone?.(done)
    } catch (e) {
      setError(e)
      setPhase('confirm')
    }
  }

  const archivedUsage = (forecast?.items ?? [])
    .filter((i) => i.outcome === 'archived')
    .reduce((sum, i) => sum + (i.usageCount ?? 0), 0)

  return (
    <Dialog open onOpenChange={(open) => !open && phase !== 'working' && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="delete-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlertIcon className="size-5 shrink-0 text-destructive" aria-hidden />
            {single
              ? t(`confirm.${verb}.titleOne`, { name: nameOf(ids[0]) })
              : t(`confirm.${verb}.titleMany`, { count: ids.length, value: formatNumber(ids.length) })}
          </DialogTitle>
          <DialogDescription>{consequence}</DialogDescription>
        </DialogHeader>

        {phase === 'checking' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            {t('confirm.checking')}
          </p>
        )}

        {phase !== 'done' && forecast && (
          <ul className="grid gap-1.5 text-sm">
            {forecast.deleted > 0 && (
              <li className="flex items-start gap-2">
                <Trash2Icon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                {single
                  ? t(`confirm.${verb}.willDeleteOne`)
                  : t(`confirm.${verb}.willDelete`, {
                      count: forecast.deleted,
                      value: formatNumber(forecast.deleted),
                    })}
              </li>
            )}
            {forecast.archived > 0 && (
              <li className="flex items-start gap-2">
                <ArchiveIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                {archivedUsage > 0
                  ? t('confirm.willArchive', {
                      count: forecast.archived,
                      value: formatNumber(forecast.archived),
                      records: formatNumber(archivedUsage),
                    })
                  : t('confirm.willArchiveHistory', {
                      count: forecast.archived,
                      value: formatNumber(forecast.archived),
                    })}
              </li>
            )}
            {forecast.blocked > 0 && (
              <li>
                <BulkResultSummary
                  result={{ ...forecast, deleted: 0, archived: 0, restored: 0, updated: 0 }}
                  nameOf={nameOf}
                  verb={verb}
                />
              </li>
            )}
          </ul>
        )}

        {phase === 'done' && result && <BulkResultSummary result={result} nameOf={nameOf} verb={verb} />}

        {needsWord && phase !== 'done' && phase !== 'checking' && actionable > 0 && (
          <div className="grid gap-2">
            <Label htmlFor={inputId}>{t('confirm.typeToConfirm', { word: t('confirm.word') })}</Label>
            <Input
              id={inputId}
              autoComplete="off"
              value={typed}
              disabled={phase === 'working'}
              onChange={(e) => setTyped(e.target.value)}
              aria-invalid={typed !== '' && !wordOk}
              data-testid="delete-confirm-word"
            />
          </div>
        )}

        {phase === 'working' && progress && <BulkProgressBar progress={progress} />}

        <FormError error={error} />

        <DialogFooter>
          {phase === 'done' ? (
            <Button onClick={onClose}>{t('common.close')}</Button>
          ) : (
            <>
              <Button variant="outline" disabled={phase === 'working'} onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                data-testid="delete-confirm"
                disabled={phase !== 'confirm' || actionable === 0 || (needsWord && !wordOk)}
                onClick={() => void confirm()}
              >
                {phase === 'working' && <Loader2Icon className="animate-spin" />}
                {single
                  ? t(`confirm.${verb}.button`)
                  : t(`confirm.${verb}.buttonMany`, { count: actionable, value: formatNumber(actionable) })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
