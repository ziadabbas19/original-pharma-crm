/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DayOfWeek } from './dayOfWeek'

export interface DoctorSlotInput {
  weekday: DayOfWeek
  start: string
  end: string
  /** @nullable */
  place?: string | null
}
