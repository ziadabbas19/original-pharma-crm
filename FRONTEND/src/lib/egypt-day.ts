/**
 * Days and months as people in Egypt count them (Africa/Cairo, daylight saving included), as
 * "yyyy-MM-dd" and "yyyy-MM" strings. The server uses the same zone (Stats:TimeZone), so a visit at
 * 00:30 Cairo time is on the new day on both sides whatever the phone's own time zone is.
 */

export const EGYPT_TIME_ZONE = 'Africa/Cairo'

/** yyyy-MM-dd */
export type DayKey = string
/** yyyy-MM */
export type MonthKey = string

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-\d{2}$/

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: EGYPT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function isDayKey(value: unknown): value is DayKey {
  return typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export function isMonthKey(value: unknown): value is MonthKey {
  return (
    typeof value === 'string' &&
    MONTH.test(value) &&
    Number(value.slice(5)) >= 1 &&
    Number(value.slice(5)) <= 12
  )
}

/** The Egypt day an instant falls on. */
export function egyptDayOf(instant: Date | string | number): DayKey {
  const date = instant instanceof Date ? instant : new Date(instant)
  const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}

export function egyptToday(now: number = Date.now()): DayKey {
  return egyptDayOf(now)
}

/** Calendar arithmetic on the day key itself (no time zone involved). */
export function addDays(day: DayKey, count: number): DayKey {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function monthOf(day: DayKey): MonthKey {
  return day.slice(0, 7)
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const year = Number(month.slice(0, 4))
  const index = Number(month.slice(5, 7)) - 1 + count
  const y = year + Math.floor(index / 12)
  const m = ((index % 12) + 12) % 12
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`
}

export function daysInMonth(month: MonthKey): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
}

export function monthBounds(month: MonthKey): { first: DayKey; last: DayKey } {
  return { first: `${month}-01`, last: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` }
}

/**
 * A Date to show a day key with Intl (noon UTC, so no time zone moves it to the next or previous day).
 */
export function dayToDate(day: DayKey): Date {
  return new Date(`${day}T12:00:00Z`)
}

/** Day of the week of a day key: 0 = Sunday ... 6 = Saturday (as .NET DayOfWeek counts them). */
export function weekdayOf(day: DayKey): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay()
}

/** Saturday, the first day of a plan week unless Plans:WeekStartsOn says otherwise. */
export const SATURDAY = 6

/** The first day of the week `day` belongs to, for weeks starting on `firstDay` (0 = Sunday). */
export function weekStartOf(day: DayKey, firstDay: number = SATURDAY): DayKey {
  return addDays(day, -((weekdayOf(day) - firstDay + 7) % 7))
}

/** The seven days of the week that starts on `start`. */
export function weekDays(start: DayKey): DayKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function addWeeks(start: DayKey, count: number): DayKey {
  return addDays(start, count * 7)
}

/** What the day picker shows for a day: today, yesterday, tomorrow, or null for any other day. */
export function relativeDayName(day: DayKey, today: DayKey): 'today' | 'yesterday' | 'tomorrow' | null {
  const diff = daysBetween(today, day)
  return diff === 0 ? 'today' : diff === -1 ? 'yesterday' : diff === 1 ? 'tomorrow' : null
}
