/**
 * Doctor visiting hours: weekdays in the Egyptian order (Saturday first), "HH:mm" times, the overlap
 * rules of the form and of the day / time search. The server applies the same rules
 * (DoctorAvailabilityRules). No React here, so the unit tests load it under Node.
 */
import type { DayOfWeek, DoctorSlotDto, DoctorSlotInput } from '../../api/generated/model/index.ts'

/** The Egyptian week: Saturday to Friday. */
export const WEEKDAYS: readonly DayOfWeek[] = [
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
]

export const SLOT_PLACE_MAX = 200

/** A slot as the form edits it. */
export interface SlotValue {
  weekday: DayOfWeek
  start: string
  end: string
  place: string
}

export type SlotProblem = 'time' | 'endBeforeStart' | 'overlap'

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** Minutes after midnight of "HH:mm", or null when the text is not a time. */
export function toMinutes(value: string | null | undefined): number | null {
  const match = TIME.exec((value ?? '').trim())
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** "HH:mm" with two-digit hours (the server may send "9:00" from older data). */
export function normalizeTime(value: string): string {
  const minutes = toMinutes(value)
  if (minutes === null) return value
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Two [start, end) ranges share some time. Touching ends do not overlap. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * The search rule (the server's DoctorAvailabilityRules.SlotMatches): a slot matches when it is on the
 * weekday (if one is chosen) and
 *  - from and to: it overlaps [from, to) (start < to and end > from; touching ends do not match);
 *  - only from: it includes that minute (start <= from < end);
 *  - only to: it starts before it.
 */
export function slotMatches(
  slot: Pick<DoctorSlotDto, 'weekday' | 'start' | 'end'>,
  filter: { weekday?: DayOfWeek | '' | null; from?: string | null; to?: string | null },
): boolean {
  if (filter.weekday && slot.weekday !== filter.weekday) return false
  const start = toMinutes(slot.start)
  const end = toMinutes(slot.end)
  if (start === null || end === null) return false
  const from = toMinutes(filter.from)
  const to = toMinutes(filter.to)
  if (from !== null && to !== null) return rangesOverlap(start, end, from, to)
  if (from !== null) return start <= from && from < end
  if (to !== null) return start < to
  return true
}

/** The doctor's slots that match the day / time search, Saturday first. */
export function matchingSlots<T extends Pick<DoctorSlotDto, 'weekday' | 'start' | 'end'>>(
  slots: readonly T[] | null | undefined,
  filter: { weekday?: DayOfWeek | '' | null; from?: string | null; to?: string | null },
): T[] {
  return sortSlots((slots ?? []).filter((s) => slotMatches(s, filter)))
}

/** Saturday first, then by start time. */
export function sortSlots<T extends Pick<DoctorSlotDto, 'weekday' | 'start'>>(slots: readonly T[]): T[] {
  return slots.toSorted(
    (a, b) =>
      WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday) ||
      (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0),
  )
}

/** Slots grouped by weekday in the Egyptian order; days without a slot are left out. */
export function groupByWeekday<T extends Pick<DoctorSlotDto, 'weekday' | 'start'>>(
  slots: readonly T[] | null | undefined,
): { weekday: DayOfWeek; slots: T[] }[] {
  const sorted = sortSlots(slots ?? [])
  return WEEKDAYS.map((weekday) => ({ weekday, slots: sorted.filter((s) => s.weekday === weekday) })).filter(
    (g) => g.slots.length > 0,
  )
}

/**
 * What is wrong with each slot of the form (same order as the list): a time that is not "HH:mm", an
 * end at or before the start, or an overlap with an earlier slot on the same weekday.
 */
export function slotProblems(slots: readonly SlotValue[]): (SlotProblem | null)[] {
  return slots.map((slot, index) => {
    const start = toMinutes(slot.start)
    const end = toMinutes(slot.end)
    if (start === null || end === null) return 'time'
    if (end <= start) return 'endBeforeStart'
    const clash = slots.slice(0, index).some((other) => {
      const otherStart = toMinutes(other.start)
      const otherEnd = toMinutes(other.end)
      return (
        other.weekday === slot.weekday &&
        otherStart !== null &&
        otherEnd !== null &&
        otherEnd > otherStart &&
        rangesOverlap(start, end, otherStart, otherEnd)
      )
    })
    return clash ? 'overlap' : null
  })
}

export function toSlotValues(slots: readonly DoctorSlotDto[] | null | undefined): SlotValue[] {
  return sortSlots(slots ?? []).map((s) => ({
    weekday: s.weekday,
    start: normalizeTime(s.start),
    end: normalizeTime(s.end),
    place: s.place ?? '',
  }))
}

export function toSlotInputs(slots: readonly SlotValue[]): DoctorSlotInput[] {
  return slots.map((s) => ({
    weekday: s.weekday,
    start: normalizeTime(s.start),
    end: normalizeTime(s.end),
    place: s.place.trim() || null,
  }))
}

/**
 * The days from `from` to `to` in the Egyptian week. A range may wrap over Friday into the next
 * week: Thursday to Sunday is Thursday, Friday, Saturday and Sunday.
 */
export function weekdayRange(from: DayOfWeek, to: DayOfWeek): DayOfWeek[] {
  const start = WEEKDAYS.indexOf(from)
  const count = ((WEEKDAYS.indexOf(to) - start + WEEKDAYS.length) % WEEKDAYS.length) + 1
  return Array.from({ length: count }, (_, i) => WEEKDAYS[(start + i) % WEEKDAYS.length])
}

/**
 * The same hours (and place) on each chosen day, added to the form's slots, Saturday first. Nothing
 * is added when the times are wrong or when the hours overlap a slot already on one of the days;
 * `conflicts` then names those days (the same overlap rule as slotProblems).
 */
export function addHours(
  slots: readonly SlotValue[],
  days: readonly DayOfWeek[],
  hours: Omit<SlotValue, 'weekday'>,
): { slots: SlotValue[]; problem: SlotProblem | null; conflicts: DayOfWeek[] } {
  const added = WEEKDAYS.filter((day) => days.includes(day)).map((weekday) => ({ ...hours, weekday }))
  const problems = slotProblems([...slots, ...added]).slice(slots.length)
  const problem = problems.find((p) => p !== null) ?? null
  if (problem) {
    const conflicts = added.filter((_, i) => problems[i] === 'overlap').map((s) => s.weekday)
    return { slots: [...slots], problem, conflicts }
  }
  return { slots: sortSlots([...slots, ...added]), problem: null, conflicts: [] }
}
