/**
 * Ordering of the rep's lists on Home (upcoming doctors, AM places). No React here, so the unit tests
 * load it under Node.
 */

/** The list with the item `fromId` moved to where `toId` is (drag and drop). Unknown ids: unchanged. */
export function moveId<T extends string>(ids: readonly T[], fromId: T, toId: T): T[] {
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return [...ids]
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, fromId)
  return next
}

/**
 * The items in the saved order. Items the saved order does not name (new on the list since) go to the
 * end, in the order they came in; saved ids that are not in the list are ignored.
 */
export function applyOrder<T>(
  items: readonly T[],
  order: readonly string[] | null | undefined,
  idOf: (item: T) => string,
): T[] {
  if (!order || order.length === 0) return [...items]
  const position = new Map(order.map((id, index) => [id, index]))
  const known = items.filter((item) => position.has(idOf(item)))
  const fresh = items.filter((item) => !position.has(idOf(item)))
  return [...known.toSorted((a, b) => position.get(idOf(a))! - position.get(idOf(b))!), ...fresh]
}
