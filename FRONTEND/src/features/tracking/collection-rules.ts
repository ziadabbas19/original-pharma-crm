/**
 * When the phone collects locations, from the server's location visibility setting (TrackingConfigDto
 * collectionMode). No React, store or platform here, so the unit tests load it directly.
 *
 *   visitOnly - only while a visit is in progress (the check-in and check-out fixes are taken on their own)
 *   allDay    - from "Start my day" to "End my day", as before
 */
export type CollectionMode = 'visitOnly' | 'allDay'

export function toCollectionMode(value: string | null | undefined): CollectionMode | null {
  return value === 'visitOnly' || value === 'allDay' ? value : null
}

export function shouldCollect(input: {
  mode: CollectionMode
  /** The working day is running (a shift is active). */
  dayRunning: boolean
  /** A visit is open on this device. */
  visitInProgress: boolean
}): boolean {
  if (!input.dayRunning) return false
  return input.mode === 'allDay' || input.visitInProgress
}
