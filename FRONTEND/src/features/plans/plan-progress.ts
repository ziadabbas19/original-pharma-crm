/**
 * Planned against done, as the plan screens show it. The numbers per day come from the server
 * (PlanProgress in the API): a completed visit counts for the plan when its day is planned and it is
 * in that day's city or to one of that day's customers; every other completed visit is "not in the
 * plan". These helpers only turn them into percentages and states, with the same rounding.
 *
 * Runtime imports stay relative so the unit tests run this file under plain Node.
 */
import { addDays, type DayKey } from '../../lib/egypt-day.ts'

export interface DayProgress {
  day: DayKey
  target: number
  done: number
  unplanned: number
  plannedCustomers: number
  plannedCustomersVisited: number
}

/** Done against planned, 0-100, rounded half up and never above 100; 0 when nothing was planned. */
export function percentOf(done: number, planned: number): number {
  if (planned <= 0) return 0
  return Math.min(100, Math.round((done * 100) / planned))
}

/** How full a day's bar is: a day planned with no target is full once anything was done. */
export function barPercent(done: number, target: number): number {
  if (target <= 0) return done > 0 ? 100 : 0
  return percentOf(done, target)
}

/**
 * off: not planned (a day off). upcoming: still to come. today: under way, target not reached yet.
 * met: the target was reached. short: the day is over below its target.
 */
export type DayState = 'off' | 'upcoming' | 'today' | 'met' | 'short'

export function dayState(
  day: DayKey,
  today: DayKey,
  planned: boolean,
  done: number,
  target: number,
): DayState {
  if (!planned) return 'off'
  if (day > today) return 'upcoming'
  if (done >= target) return 'met'
  return day === today ? 'today' : 'short'
}

/** Planned against done is worth showing once the day has started or something was done that day. */
export function showsActuals(day: DayKey, today: DayKey, progress: DayProgress | undefined): boolean {
  return day <= today || (progress?.done ?? 0) + (progress?.unplanned ?? 0) > 0
}

export interface WeekSummary {
  planned: number
  done: number
  unplanned: number
  percent: number
  daysPlanned: number
  /** Days that are over (or today) and reached their target. */
  daysMet: number
}

/** The week's totals from the per-day numbers (the server sends the same totals). */
export function weekSummary(
  days: readonly DayProgress[],
  plannedDays: ReadonlySet<DayKey>,
  today: DayKey,
): WeekSummary {
  const planned = days.reduce((sum, d) => sum + d.target, 0)
  const done = days.reduce((sum, d) => sum + d.done, 0)
  return {
    planned,
    done,
    unplanned: days.reduce((sum, d) => sum + d.unplanned, 0),
    percent: percentOf(done, planned),
    daysPlanned: plannedDays.size,
    daysMet: days.filter(
      (d) => plannedDays.has(d.day) && dayState(d.day, today, true, d.done, d.target) === 'met',
    ).length,
  }
}

/** The plan's status as the rep reads it on Home. */
export function isWeekOver(weekStart: DayKey, today: DayKey): boolean {
  return addDays(weekStart, 6) < today
}
