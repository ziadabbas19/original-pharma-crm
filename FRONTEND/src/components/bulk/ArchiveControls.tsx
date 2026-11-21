import { ArchiveIcon, Loader2Icon, Undo2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BulkResult } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { handleError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'
import { BulkResultSummary } from './BulkResultSummary'
import { type BulkProgress, runInBatches } from './run-in-batches'
import type { Selection } from './use-selection'

/** Switches a list between its current rows and the archived (deleted) ones. */
export function ArchivedToggle({
  archived,
  onChange,
  className,
}: {
  archived: boolean
  onChange: (archived: boolean) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn('inline-flex h-9 rounded-md border bg-card p-0.5', className)}
      role="group"
      aria-label={t('archive.view')}
    >
      {[false, true].map((value) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={archived === value}
          onClick={() => onChange(value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            archived === value ? 'bg-accent text-accent-foreground' : 'hover:text-foreground',
          )}
        >
          {value && <ArchiveIcon className="size-3.5" aria-hidden />}
          {value ? t('archive.archived') : t('archive.current')}
        </button>
      ))}
    </div>
  )
}

export function ArchivedBadge() {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className="gap-1">
      <ArchiveIcon aria-hidden />
      {t('archive.badge')}
    </Badge>
  )
}

/**
 * "Restore selected" for an archived list: runs the restore (in batches when the selection is large),
 * shows the per-item result and keeps the rows that could not be restored selected. The list and the
 * selection only change once the result is closed: this button lives in the selection bar, which goes
 * away with the last selected row.
 */
export function RestoreSelectedButton({
  selection,
  nameOf,
  run,
  onDone,
}: {
  selection: Selection
  nameOf: (id: string) => string
  run: (ids: string[]) => Promise<BulkResult>
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [error, setError] = useState<unknown>(null)

  const restore = async () => {
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const done = await runInBatches(selection.ids, run, { onProgress: setProgress })
      setResult(done)
    } catch (e) {
      setError(handleError(e, { silent: true, context: 'bulk.restore' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || selection.count === 0}
        onClick={() => void restore()}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />}
        {busy && progress
          ? t('bulk.progress', { done: formatNumber(progress.done), total: formatNumber(progress.total) })
          : t('archive.restoreSelected')}
      </Button>
      {(result || error !== null) && (
        <BulkResultDialog
          title={t('archive.restoreResult')}
          result={result}
          error={error}
          nameOf={nameOf}
          onClose={() => {
            if (result) {
              selection.keep(result.items.filter((i) => i.outcome === 'blocked').map((i) => i.id))
              onDone?.()
            }
            setResult(null)
            setError(null)
          }}
        />
      )}
    </>
  )
}

/** The outcome of a bulk action that needed no confirmation (restore, move to line, mark read). */
export function BulkResultDialog({
  title,
  result,
  error,
  nameOf,
  onClose,
}: {
  title: string
  result: BulkResult | null
  error?: unknown
  nameOf: (id: string) => string
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        {result && <BulkResultSummary result={result} nameOf={nameOf} />}
        <FormError error={error} />
        <DialogFooter>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
