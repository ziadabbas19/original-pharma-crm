import { useCallback, useMemo, useState } from 'react'

export interface Selection {
  /** Selected ids that are still in the list (current filters), in list order. */
  ids: string[]
  count: number
  /** How many rows match the current filters (what "select all" selects). */
  total: number
  has: (id: string) => boolean
  toggle: (id: string, on: boolean) => void
  /** Selects every row matching the current filters, not only the visible page. */
  setAll: (on: boolean) => void
  clear: () => void
  /** Keeps only these ids selected (e.g. the rows a bulk action could not handle). */
  keep: (ids: readonly string[]) => void
  allSelected: boolean
  someSelected: boolean
}

const EMPTY: ReadonlySet<string> = new Set()

/**
 * Row selection for a list. Selected ids that drop out of the list (a filter changed, a row was
 * deleted) no longer count, so actions only ever apply to rows the user can see in the list.
 */
export function useSelection<T>(rows: readonly T[] | undefined, getId: (row: T) => string): Selection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY)
  const rowIds = useMemo(() => (rows ?? []).map(getId), [rows, getId])

  const ids = useMemo(() => rowIds.filter((id) => selected.has(id)), [rowIds, selected])
  const idSet = useMemo(() => new Set(ids), [ids])

  const toggle = useCallback((id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const setAll = useCallback((on: boolean) => setSelected(on ? new Set(rowIds) : EMPTY), [rowIds])
  const clear = useCallback(() => setSelected(EMPTY), [])
  const keep = useCallback((keepIds: readonly string[]) => setSelected(new Set(keepIds)), [])

  return {
    ids,
    count: ids.length,
    total: rowIds.length,
    has: (id: string) => idSet.has(id),
    toggle,
    setAll,
    clear,
    keep,
    allSelected: rowIds.length > 0 && ids.length === rowIds.length,
    someSelected: ids.length > 0 && ids.length < rowIds.length,
  }
}
