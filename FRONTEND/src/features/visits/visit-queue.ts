import type { CheckInRequest, CheckOutRequest, VisitDetailDto } from '@/api/generated/model'

/**
 * The order rules of the visit outbox, kept free of app wiring so they can be tested alone. Every step
 * of a visit leaves the device in the order it happened (check-in, photo, content, check-out); a step
 * the server refuses holds back the later steps of that visit and of no other.
 */

export interface VisitCustomerRef {
  id: string
  name: string
  nameAr?: string | null
  type: 'doctor' | 'pharmacy'
}

interface StepBase {
  /** Sending order. Survives a retry, which puts a refused step back in its original place. */
  seq: number
  userId: string
  visitId: string
  queuedAt: string
}

export interface CheckInStep extends StepBase {
  type: 'checkIn'
  customer: VisitCustomerRef
  request: CheckInRequest
  inside: boolean
  distance: number
}

export interface PhotoStep extends StepBase {
  type: 'photo'
  photoId: string
  dataUrl: string
}

export interface CheckOutStep extends StepBase {
  type: 'checkOut'
  request: CheckOutRequest
}

export type VisitStep = CheckInStep | PhotoStep | CheckOutStep

export interface StepFailure {
  status: number
  code: string
  title?: string
  /** The API wrote the title for people (see lib/errors). */
  safeToShow?: boolean
}

export type FailedStep = VisitStep & { error: StepFailure }

export type StepOutcome = 'retry-later' | 'already-done' | 'refused'

/** What a failed request means for the step that sent it. */
export function classifyFailure(step: VisitStep, failure: StepFailure | null): StepOutcome {
  // No answer from the server, or trouble that passes by itself.
  if (!failure || failure.status >= 500 || [401, 408, 425, 429].includes(failure.status)) return 'retry-later'
  // Closed from another device or the dashboard: what this step wanted has happened.
  if (step.type === 'checkOut' && failure.code === 'visit-not-in-progress') return 'already-done'
  return 'refused'
}

/** Steps that may be sent now, oldest first: a visit with a refused step waits for the rep's retry. */
export function sendableSteps<T extends VisitStep>(
  steps: readonly T[],
  heldVisits: ReadonlySet<string>,
): T[] {
  return [...steps].filter((s) => !heldVisits.has(s.visitId)).sort((a, b) => a.seq - b.seq)
}

export interface DrainHandlers<T extends VisitStep> {
  /** Everything queued for the visit that must arrive before it is closed. False stops the run. */
  beforeCheckOut(step: T): Promise<boolean>
  send(step: T): Promise<VisitDetailDto | unknown>
  sent(step: T): Promise<void>
  refused(step: T, failure: StepFailure): Promise<void>
  failureOf(error: unknown): StepFailure | null
}

export interface DrainResult {
  sent: number
  refused: number
  /** Stopped early because the server could not be reached. */
  interrupted: boolean
}

/** Sends the steps in order. Stops at the first step that may work later, so nothing overtakes it. */
export async function drainSteps<T extends VisitStep>(
  steps: readonly T[],
  heldVisits: ReadonlySet<string>,
  handlers: DrainHandlers<T>,
): Promise<DrainResult> {
  const held = new Set(heldVisits)
  const result: DrainResult = { sent: 0, refused: 0, interrupted: false }

  for (const step of sendableSteps(steps, heldVisits)) {
    if (held.has(step.visitId)) continue
    if (step.type === 'checkOut' && !(await handlers.beforeCheckOut(step))) {
      return { ...result, interrupted: true }
    }
    try {
      await handlers.send(step)
      await handlers.sent(step)
      result.sent++
    } catch (error) {
      const failure = handlers.failureOf(error)
      const outcome = classifyFailure(step, failure)
      if (outcome === 'retry-later') return { ...result, interrupted: true }
      if (outcome === 'already-done') {
        await handlers.sent(step)
        result.sent++
        continue
      }
      await handlers.refused(step, failure as StepFailure)
      held.add(step.visitId)
      result.refused++
    }
  }
  return result
}

/** The next sending position: after everything queued, also when the device clock moved backwards. */
export function nextSeq(existing: readonly { seq: number }[], now: number): number {
  return Math.max(now, ...existing.map((s) => s.seq + 1))
}

/** A visit left open this long is treated as "forgot to check out". */
export const FORGOT_CHECK_OUT_HOURS = 4

export function forgotToCheckOut(checkInAt: string, now: number): boolean {
  const started = new Date(checkInAt)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  return now - started.getTime() >= FORGOT_CHECK_OUT_HOURS * 3_600_000 || started < startOfToday
}
