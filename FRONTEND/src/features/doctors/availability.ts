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
 * The search rule: a slot matches when it is on the weekday (if one is chosen) and overlaps the
 * time range [from, to) (either end may be left open).
 */
export function slotMatches(
  slot: Pick<DoctorSlotDto, 'weekday' | 'start' | 'end'>,
  filter: { weekday?: DayOfWeek | '' | null; from?: string | null; to?: string | null },
): boolean {
  if (filter.weekday && slot.weekday !== filter.weekday) return false
  const start = toMinutes(slot.start)
  const end = toMinutes(slot.end)
  if (start === null || end === null) return false
  const from = toMinutes(filter.from) ?? 0
  const to = toMinutes(filter.to) ?? 24 * 60
  return rangesOverlap(start, end, from, to)
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

/** A new slot for the form: the day after the last one's, or Saturday evening. */
export function nextSlot(slots: readonly SlotValue[]): SlotValue {
  const last = slots.at(-1)
  if (!last) return { weekday: 'saturday', start: '17:00', end: '21:00', place: '' }
  const day = WEEKDAYS[(WEEKDAYS.indexOf(last.weekday) + 1) % WEEKDAYS.length]
  return { weekday: day, start: last.start, end: last.end, place: last.place }
}
