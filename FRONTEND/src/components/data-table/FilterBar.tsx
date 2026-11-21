import { SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { Children, Fragment, isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsPhone } from '@/hooks/use-media-query'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { FilterField, type FilterFieldProps } from './toolbar'

/** Children of a toolbar, with fragments opened so FilterFields can be found. */
function flatten(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? flatten(child.props.children)
      : [child],
  )
}

function isFilter(node: ReactNode): node is ReactElement<FilterFieldProps> {
  return isValidElement(node) && node.type === FilterField
}

/**
 * A row of search, filters and actions. On wide screens everything stays in the row. On phones the
 * FilterFields move into a bottom sheet behind a Filters button (with Reset and Apply; filters apply
 * as they change), and the active ones show as chips that can be removed one by one.
 */
export function FilterBar({
  children,
  onClearFilters,
  className,
}: {
  children: ReactNode
  /** Clears every filter (Reset). Without it, Reset calls each active field's onReset. */
  onClearFilters?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const [open, setOpen] = useState(false)
  const items = flatten(children)
  const filters = items.filter(isFilter)

  if (!phone || filters.length === 0) {
    return <div className={cn('flex flex-wrap items-end gap-2', className)}>{children}</div>
  }

  const others = items.filter((node) => !isFilter(node))
  const active = filters.filter((f) => f.props.active)
  const reset = () => {
    if (onClearFilters) onClearFilters()
    else for (const f of active) f.props.onReset?.()
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {others}
        <Button
          variant={active.length > 0 ? 'soft' : 'outline'}
          className="ms-auto"
          onClick={() => setOpen(true)}
          data-testid="open-filters"
        >
          <SlidersHorizontalIcon />
          {t('table.filters')}
          {active.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
              {formatNumber(active.length)}
            </span>
          )}
        </Button>
      </div>
      {active.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('table.activeFilters')} data-testid="filter-chips">
          {active.map((f) => (
            <li key={f.props.label}>
              <span className="inline-flex min-h-9 items-center gap-1 rounded-full border bg-primary-soft ps-3 text-sm text-primary-soft-foreground">
                <span className="max-w-48 truncate">
                  <span className="sr-only">{f.props.label}: </span>
                  {f.props.display ?? f.props.label}
                </span>
                {f.props.onReset && (
                  <button
                    type="button"
                    onClick={f.props.onReset}
                    className="flex size-9 items-center justify-center rounded-full hover:bg-primary/10"
                    aria-label={t('table.removeFilter', { name: f.props.label })}
                  >
                    <XIcon className="size-3.5" aria-hidden />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0" data-testid="filter-sheet">
          <SheetHeader className="border-b">
            <SheetTitle>{t('table.filters')}</SheetTitle>
            <SheetDescription className="sr-only">{t('table.filtersHint')}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 overflow-y-auto p-4 [&_[data-slot=native-select-wrapper]]:w-full">
            {filters.map((f) => (
              <FilterField key={f.props.label} {...f.props} className={cn(f.props.className, 'w-full')} />
            ))}
          </div>
          <SheetFooter className="flex-row gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" className="flex-1" onClick={reset} disabled={active.length === 0}>
              {t('table.resetFilters')}
            </Button>
            <Button className="flex-1" onClick={() => setOpen(false)} data-testid="apply-filters">
              {t('table.applyFilters')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
