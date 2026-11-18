import { flexRender, useTable, type ColumnDef, type RowData, type SortingState } from '@tanstack/react-table'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  SearchXIcon,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SelectionBar } from '@/components/bulk/SelectionBar'
import type { Selection } from '@/components/bulk/use-selection'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { dataTableFeatures, type DataTableFeatures } from './features'

const PAGE_SIZES = [10, 25, 50, 100]
const NO_ROWS: never[] = []

/**
 * The row actions stay in view when a table is wider than its card. The backgrounds are opaque
 * versions of the row colours, so scrolled cells do not show through.
 */
const ACTIONS_HEAD =
  'sticky end-0 z-[1] bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] @max-3xl:border-s'
const ACTIONS_CELL = cn(
  'sticky end-0 z-[1] bg-card @max-3xl:border-s',
  '[tr:hover>&]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]',
  '[tr[data-state=selected]>&]:bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))]',
  '@max-md:[&>div]:max-w-[5.5rem] @max-md:[&>div]:flex-wrap',
)

export interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Undefined while the first request is in flight. Keep the array reference stable (memoize). */
  data: TData[] | undefined
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  getRowId?: (row: TData) => string
  initialSorting?: SortingState
  pageSize?: number
  /** Filters, search and actions shown above the table. */
  toolbar?: ReactNode
  /** Shown under the table, e.g. "showing the first 1000 rows". */
  footer?: ReactNode
  rowClassName?: (row: TData) => string | undefined
  /** Makes rows clickable (and reachable with the keyboard: Enter or Space). */
  onRowClick?: (row: TData) => void
  empty: { title: string; description?: string; icon?: LucideIcon; action?: ReactNode }
  /** When filters are active an empty result reads "no matches" and offers to clear them. */
  filtered?: boolean
  onClearFilters?: () => void
  /**
   * Row selection: a checkbox per row and a "select all" in the header that selects every row
   * matching the current filters (all pages). Needs `getRowId`.
   */
  selection?: Selection
  /** Name of a row for its checkbox label (screen readers). */
  rowLabel?: (row: TData) => string
  /** Bulk actions shown in the bar that appears while rows are selected. */
  bulkActions?: ReactNode
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  isLoading,
  error,
  onRetry,
  getRowId,
  initialSorting,
  pageSize = 25,
  toolbar,
  footer,
  rowClassName,
  onRowClick,
  empty,
  filtered,
  onClearFilters,
  selection,
  rowLabel,
  bulkActions,
}: DataTableProps<TData>) {
  const { t } = useTranslation()
  const rows: TData[] = data ?? NO_ROWS

  const initialState = useMemo(
    () => ({ sorting: initialSorting ?? [], pagination: { pageIndex: 0, pageSize } }),
    // Initial state is read once at construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: rows,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    initialState,
  })

  const { pageIndex, pageSize: currentPageSize } = table.state.pagination
  const total = table.getPrePaginatedRowModel().rows.length
  const first = total === 0 ? 0 : pageIndex * currentPageSize + 1
  const last = Math.min(total, (pageIndex + 1) * currentPageSize)
  const pageRows = table.getRowModel().rows

  let body: ReactNode
  if (error && !data) {
    body = (
      <div className="p-3">
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    )
  } else if (isLoading && !data) {
    body = <LoadingState className="p-3" />
  } else if (rows.length === 0) {
    body = filtered ? (
      <EmptyState
        icon={SearchXIcon}
        title={t('states.noMatches')}
        description={t('states.noMatchesHint')}
        action={
          onClearFilters && (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              {t('states.clearFilters')}
            </Button>
          )
        }
      />
    ) : (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    )
  } else {
    body = (
      <>
        {error ? (
          <div className="px-3 pt-3">
            <ErrorState error={error} onRetry={onRetry} />
          </div>
        ) : null}
        <Table>
          <TableHeader className="bg-muted/40">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {selection && (
                  <TableHead className="w-10 px-3">
                    <Checkbox
                      aria-label={t('bulk.selectAll', {
                        count: selection.total,
                        value: formatNumber(selection.total),
                      })}
                      title={t('bulk.selectAll', {
                        count: selection.total,
                        value: formatNumber(selection.total),
                      })}
                      checked={
                        selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false
                      }
                      onCheckedChange={(v) => selection.setAll(v === true)}
                    />
                  </TableHead>
                )}
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta
                  const sorted = header.column.getIsSorted()
                  const content = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        'px-3 text-muted-foreground',
                        meta?.className,
                        header.column.id === 'actions' && ACTIONS_HEAD,
                      )}
                      aria-sort={
                        sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          {content}
                          {sorted === 'asc' ? (
                            <ArrowUpIcon className="size-3.5" />
                          ) : sorted === 'desc' ? (
                            <ArrowDownIcon className="size-3.5" />
                          ) : (
                            <ChevronsUpDownIcon className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        content
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow
                key={row.id}
                data-state={selection?.has(row.id) ? 'selected' : undefined}
                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onRowClick(row.original)
                        }
                      }
                    : undefined
                }
              >
                {selection && (
                  <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={t('bulk.selectRow', { name: rowLabel?.(row.original) ?? row.id })}
                      checked={selection.has(row.id)}
                      onCheckedChange={(v) => selection.toggle(row.id, v === true)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                )}
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      'px-3',
                      cell.column.columnDef.meta?.className,
                      cell.column.id === 'actions' && ACTIONS_CELL,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {t('table.range', {
              first: formatNumber(first),
              last: formatNumber(last),
              total: formatNumber(total),
            })}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <span className="hidden sm:inline">{t('table.pageSize')}</span>
              <NativeSelect
                size="sm"
                className="w-20"
                value={currentPageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                aria-label={t('table.pageSize')}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {formatNumber(size)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label={t('table.previous')}
            >
              <ChevronLeftIcon className="rtl:rotate-180" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label={t('table.next')}
            >
              <ChevronRightIcon className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {toolbar && <div className="flex flex-wrap items-end gap-2 border-b p-3">{toolbar}</div>}
      {selection && <SelectionBar selection={selection}>{bulkActions}</SelectionBar>}
      {body}
      {footer && <div className="border-t px-3 py-2 text-xs text-muted-foreground">{footer}</div>}
    </Card>
  )
}
