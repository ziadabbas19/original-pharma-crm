/**
 * Product lines on the user dialogs. Nothing stored means no limit: the user sees and orders every
 * product. Turning "All product lines" off limits the user to the ticked lines, at least one.
 */
export interface LineChoice {
  all: boolean
  /** Ticked lines; kept while "All" is on so switching back does not lose them. */
  lineIds: string[]
}

export function initialLineChoice(lineIds: readonly string[] | null | undefined): LineChoice {
  const ids = [...(lineIds ?? [])]
  return { all: ids.length === 0, lineIds: ids }
}

/** What the server stores: nothing for all lines, otherwise the ticked lines. */
export function lineIdsToSave(choice: LineChoice): string[] {
  return choice.all ? [] : choice.lineIds
}

/** Limiting to specific lines needs at least one ticked. */
export function lineChoiceMissing(choice: LineChoice): boolean {
  return !choice.all && choice.lineIds.length === 0
}

export function sameLineIds(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a)
  return set.size === new Set(b).size && b.every((id) => set.has(id))
}

export function toggleLine(choice: LineChoice, lineId: string, checked: boolean): LineChoice {
  const rest = choice.lineIds.filter((id) => id !== lineId)
  return { ...choice, lineIds: checked ? [...rest, lineId] : rest }
}
