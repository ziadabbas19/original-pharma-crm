/**
 * Forgiving name search, the same rules as the server (CustomerNameSearch): used on lists the phone
 * already holds (the rep's own doctors, also offline). No React here, so the unit tests load it under Node.
 *  - Arabic: diacritics and tatweel removed; أ إ آ ٱ -> ا; ى ئ -> ي; ة -> ه; ؤ -> و.
 *  - Latin: lower case.
 *  - Runs of white space become one space; a leading title (د، د.، د/، دكتور، دكتورة، dr, dr.) is dropped.
 */

const MARKS = /[\u064B-\u065F\u0670\u0640]/g
const LETTERS: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ى: 'ي',
  ئ: 'ي',
  ة: 'ه',
  ؤ: 'و',
}
const TITLE = /^(?:دكتوره|دكتور|د|dr)(?:\s*[./]\s*|\s+)/

export function normalizeName(value: string | null | undefined): string {
  if (!value) return ''
  const text = value
    .toLowerCase()
    .replace(MARKS, '')
    .replace(/[أإآٱىئةؤ]/g, (ch) => LETTERS[ch] ?? ch)
    .replace(/\s+/g, ' ')
    .trim()
  return text.replace(TITLE, '').trim()
}

/**
 * How close a name is to the (normalized) search text: 0 the whole name, 1 starts with it, 2 a word
 * starts with it, 3 contains it, null no match. The best of the given names counts.
 */
export function nameCloseness(names: readonly (string | null | undefined)[], term: string): number | null {
  let best: number | null = null
  for (const name of names) {
    const value = normalizeName(name)
    if (!value) continue
    const rank =
      value === term
        ? 0
        : value.startsWith(term)
          ? 1
          : ` ${value}`.includes(` ${term}`)
            ? 2
            : value.includes(term)
              ? 3
              : null
    if (rank !== null && (best === null || rank < best)) best = rank
  }
  return best
}

/**
 * The rows matching the search, closest names first, then alphabetical (the order the server uses).
 * `extra` may match other text (a phone number) as is; such rows come after the name matches.
 */
export function searchByName<T>(
  rows: readonly T[],
  search: string,
  names: (row: T) => readonly (string | null | undefined)[],
  extra?: (row: T) => string | null | undefined,
): T[] {
  const term = normalizeName(search)
  if (!term) return [...rows]
  const raw = search.trim()
  return rows
    .map((row) => {
      const rank = nameCloseness(names(row), term) ?? ((extra?.(row) ?? '').includes(raw) ? 4 : null)
      return { row, rank, key: normalizeName(names(row)[0]) }
    })
    .filter((x): x is { row: T; rank: number; key: string } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key))
    .map((x) => x.row)
}
