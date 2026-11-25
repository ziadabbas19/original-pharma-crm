import {
  flexRender,
  useTable,
  type Cell,
  type ColumnDef,
  type Header,
  type Row,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  EllipsisVerticalIcon,
  SearchXIcon,
  type LucideIcon,
} from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SelectionBar } from '@/components/bulk/SelectionBar'
import type { Selection } from '@/components/bulk/use-selection'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useIsPhone } from '@/hooks/use-media-query'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { dataTableFeatures, type DataTableFeatures } from './features'
import { FilterBar } from './FilterBar'
import { rowClickProps } from './row-click'

const PAGE_SIZES = [10, 25, 50, 100]
/** Rows with a primary action: pointer, hover tint (from TableRow) and a visible keyboard focus ring. */
const CLICKABLE_ROW =
  'cursor-pointer hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
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
  /**
   * The row's primary action, run by a click on the row (or its phone card) and by Enter or Space on it:
   * the first non-destructive action of its row menu (view or open, otherwise edit), never delete, archive
   * or deactivate. Clicks on checkboxes, links, buttons and the menu itself, and selecting text, do not
   * trigger it.
   */
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
  const phone = useIsPhone()
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
        {phone ? (
          <CardList
            rows={pageRows}
            headers={table.getFlatHeaders()}
            sorting={table.state.sorting}
            onSort={(next) => table.setSorting(next)}
            selection={selection}
            rowLabel={rowLabel}
            rowClassName={rowClassName}
            onRowClick={onRowClick}
          />
        ) : (
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
                  className={cn(onRowClick && CLICKABLE_ROW, rowClassName?.(row.original))}
                  {...rowClickProps(row.original, onRowClick)}
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
                      data-no-row-click={cell.column.id === 'actions' || undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
      {toolbar && (
        <div className="border-b p-3">
          <FilterBar onClearFilters={onClearFilters}>{toolbar}</FilterBar>
        </div>
      )}
      {selection && <SelectionBar selection={selection}>{bulkActions}</SelectionBar>}
      {body}
      {footer && <div className="border-t px-3 py-2 text-xs text-muted-foreground">{footer}</div>}
    </Card>
  )
}

type CardRow<TData extends RowData> = Row<DataTableFeatures, TData>
type CardCell<TData extends RowData> = Cell<DataTableFeatures, TData, unknown>
type CardHeader<TData extends RowData> = Header<DataTableFeatures, TData, unknown>

/**
 * Rows as cards for phones: the title column on top, the other columns as labelled fields, the
 * row actions in a menu, and a sort picker and select-all above the list.
 */
function CardList<TData extends RowData>({
  rows,
  headers,
  sorting,
  onSort,
  selection,
  rowLabel,
  rowClassName,
  onRowClick,
}: {
  rows: CardRow<TData>[]
  headers: CardHeader<TData>[]
  sorting: SortingState
  onSort: (sorting: SortingState) => void
  selection?: Selection
  rowLabel?: (row: TData) => string
  rowClassName?: (row: TData) => string | undefined
  onRowClick?: (row: TData) => void
}) {
  const { t } = useTranslation()
  const headerOf = (id: string) => headers.find((h) => h.column.id === id)
  const label = (id: string) => {
    const header = headerOf(id)
    return header && !header.isPlaceholder
      ? flexRender(header.column.columnDef.header, header.getContext())
      : null
  }
  const sortable = headers.filter((h) => h.column.getCanSort() && !h.isPlaceholder)
  const sortValue = sorting[0] ? `${sorting[0].id}:${sorting[0].desc ? 'desc' : 'asc'}` : ''

  return (
    <div data-testid="card-list">
      {(sortable.length > 0 || selection) && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2">
          {selection && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <Checkbox
                checked={selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false}
                onCheckedChange={(v) => selection.setAll(v === true)}
              />
              {t('bulk.selectAll', { count: selection.total, value: formatNumber(selection.total) })}
            </label>
          )}
          {sortable.length > 0 && (
            <NativeSelect
              className="ms-auto w-auto min-w-40"
              value={sortValue}
              onChange={(e) => {
                const [id, dir] = e.target.value.split(':')
                onSort(id ? [{ id, desc: dir === 'desc' }] : [])
              }}
              aria-label={t('table.sortBy')}
            >
              <option value="">{t('table.sortDefault')}</option>
              {sortable.map((h) => {
                const text = headerText(h)
                return (
                  <Fragment key={h.id}>
                    <option value={`${h.column.id}:asc`}>{t('table.sortAscending', { name: text })}</option>
                    <option value={`${h.column.id}:desc`}>{t('table.sortDescending', { name: text })}</option>
                  </Fragment>
                )
              })}
            </NativeSelect>
          )}
        </div>
      )}
      <ul className="divide-y">
        {rows.map((row) => {
          const cells = row.getAllCells() as CardCell<TData>[]
          const actions = cells.find((c) => c.column.id === 'actions')
          const content = cells.filter(
            (c) => c.column.id !== 'actions' && c.column.columnDef.meta?.card !== 'hidden',
          )
          const title = content.find((c) => c.column.columnDef.meta?.card === 'title') ?? content[0]
          const fields = content.filter((c) => c !== title)
          const name = rowLabel?.(row.original) ?? row.id
          return (
            <li
              key={row.id}
              data-state={selection?.has(row.id) ? 'selected' : undefined}
              className={cn(
                'flex items-start gap-3 p-3 data-[state=selected]:bg-primary/5',
                onRowClick && cn(CLICKABLE_ROW, 'active:bg-accent'),
                rowClassName?.(row.original),
              )}
              {...rowClickProps(row.original, onRowClick)}
              data-testid="card-row"
            >
              {selection && (
                <div className="flex min-h-11 items-center" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={t('bulk.selectRow', { name })}
                    checked={selection.has(row.id)}
                    onCheckedChange={(v) => selection.toggle(row.id, v === true)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              <div className="grid min-w-0 flex-1 gap-2">
                {title && (
                  <div className="min-w-0 font-medium break-words">
                    {flexRender(title.column.columnDef.cell, title.getContext())}
                  </div>
                )}
                {fields.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    {fields.map((cell) => (
                      <div key={cell.id} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{label(cell.column.id)}</dt>
                        <dd className="min-w-0 break-words [&_[data-slot=badge]]:whitespace-normal">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              {actions && (
                <RowActions title={name}>
                  {flexRender(actions.column.columnDef.cell, actions.getContext())}
                </RowActions>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Plain text of a column header, for the sort picker (headers may be strings or render functions). */
function headerText<TData extends RowData>(header: CardHeader<TData>): string {
  const def = header.column.columnDef.header
  if (typeof def === 'string') return def
  if (typeof def === 'function') {
    try {
      const rendered: unknown = def(header.getContext())
      if (typeof rendered === 'string') return rendered
    } catch {
      // fall through to the column id
    }
  }
  return header.column.id
}

/**
 * A row's actions on a phone: one button that opens a sheet listing them. Buttons show their own
 * label there (tables hide it when narrow), or their accessible name when they only have an icon, so
 * every action reads as a labelled row.
 */
function RowActions({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('table.actionsFor', { name: title })}
        onClick={() => setOpen(true)}
        data-testid="row-actions"
      >
        <EllipsisVerticalIcon />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="gap-0"
          onCloseAutoFocus={(e) => e.preventDefault()}
          data-testid="row-actions-sheet"
        >
          <SheetHeader className="border-b">
            <SheetTitle className="truncate">{title}</SheetTitle>
            <SheetDescription className="sr-only">{t('table.actions')}</SheetDescription>
          </SheetHeader>
          {/* Closes after the action's own click handler has run (it may open a dialog). */}
          <div
            className={cn(
              'grid gap-1 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
              '[&_div]:flex-col [&_div]:items-stretch [&_div]:gap-1 [&>div]:max-w-none',
              '[&_a]:min-h-12 [&_a]:w-full [&_a]:justify-start [&_button]:h-12 [&_button]:w-full [&_button]:justify-start [&_button]:gap-3 [&_button]:px-3',
              // Labels: the button's own text (often hidden in narrow tables), or its accessible name.
              '[&_button>span]:inline!',
              '[&_button:has(>svg:only-child)]:after:font-medium [&_button:has(>svg:only-child)]:after:content-[attr(aria-label)]',
            )}
            onClickCapture={() => setTimeout(() => setOpen(false), 0)}
          >
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
