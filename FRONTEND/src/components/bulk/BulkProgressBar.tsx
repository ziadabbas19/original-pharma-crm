import { useTranslation } from 'react-i18next'
import { formatNumber } from '@/lib/format'
import type { BulkProgress } from './run-in-batches'

/** How far a selection sent in several requests has got. */
export function BulkProgressBar({ progress }: { progress: BulkProgress }) {
  const { t } = useTranslation()
  const label = t('bulk.progress', {
    done: formatNumber(progress.done),
    total: formatNumber(progress.total),
  })
  return (
    <div className="grid gap-1.5" data-testid="bulk-progress">
      <p className="text-sm text-muted-foreground" role="status">
        {label}
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${(progress.done / progress.total) * 100}%` }}
        />
      </div>
    </div>
  )
}
