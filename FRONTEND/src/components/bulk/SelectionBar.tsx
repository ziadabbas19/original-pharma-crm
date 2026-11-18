import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Selection } from './use-selection'

/** Shown while rows are selected: the count, a way to clear it, and the bulk actions of the list. */
export function SelectionBar({
  selection,
  children,
  className,
}: {
  selection: Selection
  children?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  if (selection.count === 0) return null
  return (
    <div
      role="region"
      aria-label={t('bulk.actions')}
      className={cn(
        'flex flex-wrap items-center gap-2 border-b bg-primary/5 px-3 py-2 text-sm',
        'sticky top-0 z-10',
        className,
      )}
    >
      <span className="font-medium tabular-nums" aria-live="polite">
        {t('bulk.selected', { count: selection.count, value: formatNumber(selection.count) })}
      </span>
      {!selection.allSelected && selection.total > selection.count && (
        <Button size="sm" variant="link" className="h-auto px-1" onClick={() => selection.setAll(true)}>
          {t('bulk.selectAllMatching', {
            count: selection.total,
            value: formatNumber(selection.total),
          })}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={selection.clear}>
        <XIcon />
        {t('bulk.clear')}
      </Button>
      <div className="flex flex-1 flex-wrap justify-end gap-2">{children}</div>
    </div>
  )
}
