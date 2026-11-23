/**
 * Plain helpers of the plan screens (no React), so the unit tests can run them under Node.
 * Runtime imports stay relative.
 */
import type { CustomerType, WeeklyPlanDayInput, WeeklyPlanDto } from '../../api/generated/model/index.ts'
import type { DayKey } from '../../lib/egypt-day.ts'

export const PLAN_NOTE_MAX = 500
export const PLAN_TARGET_MAX = 100

/** A doctor on the rep's list, a pharmacy or an AM place in the rep's area, with its town. */
export interface PlanCustomerOption {
  id: string
  type: CustomerType
  name: string
  nameAr?: string | null
  townId: string | null
  hint?: string | null
}

/** A whole number from 0 to 100, or null for anything else. */
export function parseTarget(value: string): number | null {
  if (!/^\d{1,3}$/.test(value.trim())) return null
  const n = Number(value)
  return n >= 0 && n <= PLAN_TARGET_MAX ? n : null
}

/** The last copy of a week's plan on this phone, for offline reading. */
export const planCacheKey = (week: DayKey | undefined) => `plan-mine-${week ?? 'current'}`

/** The plan's days as the save request takes them. */
export function toInputs(plan: Pick<WeeklyPlanDto, 'days'>): WeeklyPlanDayInput[] {
  return plan.days.map((d) => ({
    day: d.day,
    cityId: d.cityId,
    targetVisits: d.targetVisits,
    note: d.note,
    customerIds: d.customers.map((c) => c.customerId),
    amPlaceIds: (d.amPlaces ?? []).map((c) => c.customerId),
  }))
}

/** The week's days with one day planned (added or replaced), in day order. */
export function withDay(days: WeeklyPlanDayInput[], input: WeeklyPlanDayInput): WeeklyPlanDayInput[] {
  return [...days.filter((d) => d.day !== input.day), input].sort((a, b) => a.day.localeCompare(b.day))
}

/** The week's days with one day made a day off. */
export function withoutDay(days: WeeklyPlanDayInput[], day: DayKey): WeeklyPlanDayInput[] {
  return days.filter((d) => d.day !== day)
}
