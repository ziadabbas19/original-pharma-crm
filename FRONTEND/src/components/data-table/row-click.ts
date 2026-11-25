/**
 * Clicking a table row (or a phone card) runs the row's primary action: the first action of its row menu
 * that is not destructive (view or open, otherwise edit; never delete, archive or deactivate). Each table
 * passes that action as `onRowClick`; these rules decide which clicks and keys count as "the row".
 */

/** Controls of their own inside a row: clicking them never also runs the row action. */
export const ROW_CLICK_IGNORE =
  'a, button, input, select, textarea, label, summary, [role=button], [role=checkbox], [role=menuitem], [role=link], [role=switch], [contenteditable=true], [data-no-row-click]'

/** The DOM parts the rule needs (an Element in the browser; plain objects in tests). */
export interface RowNode {
  contains(other: unknown): boolean
}
export interface RowTarget {
  closest(selector: string): unknown
}

export interface RowClick {
  target: RowTarget | null
  /** The row (or card) element the handler is on. */
  row: RowNode
  /** Mouse button; only the main one counts. */
  button?: number
  /** Text the user has selected on the page at the time of the click. */
  selectedText?: string
}

/**
 * True when a click on a row should run its primary action: the main button, inside the row in the page
 * (not in a dialog that was opened from the row and is rendered elsewhere), not on a control of its own
 * (checkbox, link, button, the actions menu), and not the end of selecting text.
 */
export function isRowActivation({ target, row, button = 0, selectedText = '' }: RowClick): boolean {
  if (button !== 0 || !target) return false
  if (!row.contains(target)) return false
  if (selectedText.trim() !== '') return false
  const control = target.closest(ROW_CLICK_IGNORE)
  return !(control && control !== row && row.contains(control))
}

/** Enter (or Space) on the focused row itself, not on a control inside it. */
export function isRowKeyActivation(key: string, onRowItself: boolean): boolean {
  return onRowItself && (key === 'Enter' || key === ' ')
}

/** Shared handlers for a clickable row or card. */
export function rowClickProps<TRow>(row: TRow, onRowClick: ((row: TRow) => void) | undefined) {
  if (!onRowClick) return {}
  return {
    tabIndex: 0,
    'data-clickable': true,
    onClick: (e: { target: EventTarget | null; currentTarget: Element; button: number }) => {
      const selectedText = typeof window === 'undefined' ? '' : (window.getSelection?.()?.toString() ?? '')
      if (
        isRowActivation({
          target: e.target as unknown as RowTarget | null,
          row: e.currentTarget,
          button: e.button,
          selectedText,
        })
      )
        onRowClick(row)
    },
    onKeyDown: (e: {
      key: string
      target: EventTarget | null
      currentTarget: Element
      preventDefault: () => void
    }) => {
      if (!isRowKeyActivation(e.key, e.target === e.currentTarget)) return
      e.preventDefault()
      onRowClick(row)
    },
  }
}
