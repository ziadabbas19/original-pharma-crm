import type { NoteDto } from '@/api/generated/model'
import { addDays, EGYPT_TIME_ZONE, egyptDayOf, type DayKey } from '../../lib/egypt-day.ts'

/**
 * Reminder times of private notes. People pick a day and a time in Egypt time (whatever the phone's own
 * zone is) and how long before it they want to hear about it; the reminder fires at that time minus the
 * chosen minutes. Kept free of app wiring so it can be tested alone.
 */

/** The "notify me before" choices, in minutes (0 = at the time). Anything else is a custom value. */
export const BEFORE_PRESETS = [0, 5, 15, 30, 60, 120, 1440] as const

/** The longest "before" the server accepts (one week). */
export const MAX_BEFORE_MINUTES = 10_080

/** Snooze choices offered on a reminder. */
export type SnoozeChoice = '10m' | '1h' | 'tomorrow'

/** "Tomorrow morning" means 09:00 Egypt time on the next day. */
export const MORNING = '09:00'

const MINUTE = 60_000

const wallClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: EGYPT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function parts(instant: number): Record<string, string> {
  return Object.fromEntries(wallClock.formatToParts(new Date(instant)).map((p) => [p.type, p.value]))
}

/** How far Egypt's clock is ahead of UTC at an instant, in ms (2 or 3 hours with daylight saving). */
function offsetAt(instant: number): number {
  const p = parts(instant)
  const wall = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return wall - Math.floor(instant / 1000) * 1000
}

/** "HH:mm" (24 h) is a valid time of day. */
export function isTimeKey(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** The instant (ISO, UTC) of a day and time on Egypt's clock. */
export function egyptInstant(day: DayKey, time: string): string {
  const [hour, minute] = time.split(':').map(Number)
  const wall = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
    hour,
    minute,
  )
  // The offset depends on the instant itself (daylight saving), so settle it in two steps.
  let instant = wall - offsetAt(wall)
  instant = wall - offsetAt(instant)
  return new Date(instant).toISOString()
}

/** The Egypt day and "HH:mm" of an instant (what the reminder form shows). */
export function egyptDayAndTime(instant: string | number | Date): { day: DayKey; time: string } {
  const ms = new Date(instant).getTime()
  const p = parts(ms)
  return { day: egyptDayOf(ms), time: `${p.hour}:${p.minute}` }
}

/** When the reminder fires: the reminder time minus the chosen minutes. */
export function notifyAtOf(
  remindAt: string | null | undefined,
  beforeMinutes: number | null | undefined,
): string | null {
  if (!remindAt) return null
  return new Date(new Date(remindAt).getTime() - Math.max(0, beforeMinutes ?? 0) * MINUTE).toISOString()
}

/** A "before" value typed by hand: whole minutes from 0 to one week, or null. */
export function parseBeforeMinutes(input: string): number | null {
  const western = input.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  if (!/^\d{1,5}$/.test(western)) return null
  const value = Number(western)
  return value <= MAX_BEFORE_MINUTES ? value : null
}

/** The instant a snooze choice points at. */
export function snoozeUntil(choice: SnoozeChoice, now: number = Date.now()): string {
  switch (choice) {
    case '10m':
      return new Date(now + 10 * MINUTE).toISOString()
    case '1h':
      return new Date(now + 60 * MINUTE).toISOString()
    case 'tomorrow':
      return egyptInstant(addDays(egyptDayOf(now), 1), MORNING)
  }
}

/** Minutes to send with a snooze queued for `until` (it may go out later, offline): at least one. */
export function snoozeMinutesFor(until: string, now: number = Date.now()): number {
  return Math.min(MAX_BEFORE_MINUTES, Math.max(1, Math.ceil((new Date(until).getTime() - now) / MINUTE)))
}

/**
 * none: no reminder; done: the note is done; upcoming: not notified yet; due: notified, the time has not
 * come yet; overdue: the reminder time has passed.
 */
export type ReminderState = 'none' | 'done' | 'upcoming' | 'due' | 'overdue'

type ReminderFields = Pick<NoteDto, 'remindAt' | 'remindBeforeMinutes' | 'notifyAt' | 'doneAt'>

export function reminderState(note: ReminderFields, now: number = Date.now()): ReminderState {
  if (note.doneAt) return 'done'
  if (!note.remindAt) return 'none'
  const notifyAt = new Date(
    note.notifyAt ?? notifyAtOf(note.remindAt, note.remindBeforeMinutes) ?? note.remindAt,
  ).getTime()
  if (now < notifyAt) return 'upcoming'
  return now <= new Date(note.remindAt).getTime() ? 'due' : 'overdue'
}

/** Home card: every due or overdue reminder (oldest first, at most `maxLate`), then the next `limit` upcoming ones. */
export function homeReminders<T extends ReminderFields>(
  notes: readonly T[],
  now: number = Date.now(),
  limit = 3,
  maxLate = 5,
): { late: T[]; upcoming: T[] } {
  const byNotify = (a: T, b: T) =>
    (notifyAtOf(a.remindAt, a.remindBeforeMinutes) ?? '').localeCompare(
      notifyAtOf(b.remindAt, b.remindBeforeMinutes) ?? '',
    )
  const late = notes
    .filter((n) => ['due', 'overdue'].includes(reminderState(n, now)))
    .sort(byNotify)
    .slice(0, maxLate)
  const upcoming = notes
    .filter((n) => reminderState(n, now) === 'upcoming')
    .sort(byNotify)
    .slice(0, limit)
  return { late, upcoming }
}

/** The "before" choice to show for a saved value: a preset, or "custom". */
export function beforeChoiceOf(minutes: number | null | undefined): string {
  const value = minutes ?? 0
  return (BEFORE_PRESETS as readonly number[]).includes(value) ? String(value) : 'custom'
}

/** The reminder time on Egypt's clock, in the reader's language, e.g. "Tue 1 Dec, 9:00 AM". */
export function formatReminder(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: EGYPT_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}
