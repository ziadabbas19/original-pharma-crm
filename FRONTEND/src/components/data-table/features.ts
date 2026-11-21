import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type RowData,
} from '@tanstack/react-table'

export interface DataTableColumnMeta {
  /** Extra classes for the header and body cells of the column (e.g. `hidden md:table-cell`). */
  className?: string
  /**
   * Phones show rows as cards: the first column is the card title and the others are labelled fields.
   * `title` picks another column for the title; `hidden` leaves the column out of the card.
   */
  card?: 'title' | 'hidden'
}

/**
 * Feature set shared by every dashboard list: client-side sorting and paging.
 * Filtering happens before the rows reach the table (server params or a memo
 * in the page), so the filter UI can mix server and client criteria freely.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  columnMeta: metaHelper<DataTableColumnMeta>(),
})

export type DataTableFeatures = typeof dataTableFeatures

/** Typed column helper for a row type, bound to the shared feature set. */
export function dataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>()
}
