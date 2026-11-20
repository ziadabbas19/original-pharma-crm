/**
 * How the rep app reacts to a fake (mock) location: plain state transitions with no imports, so the
 * unit tests load this file directly.
 *
 * A mock fix starts an episode: tracking is treated as untrustworthy, the rep sees a message and the
 * app checks again on its own with a growing pause. The first real fix ends the episode. Nothing here
 * blocks the rest of the app.
 */

export interface MockWatchState {
  /** A mock fix was seen and no real fix since. */
  active: boolean
  /** Device time of the first mock fix of this episode (ISO 8601). */
  since: string | null
  /** Automatic re-checks done in this episode. */
  attempts: number
  /** When the next automatic re-check is due (epoch ms); null when idle. */
  nextCheckAt: number | null
  /** When this episode was last reported to the server (epoch ms). */
  reportedAt: number | null
}

export const IDLE_MOCK_WATCH: MockWatchState = {
  active: false,
  since: null,
  attempts: 0,
  nextCheckAt: null,
  reportedAt: null,
}

/** Pause before each automatic re-check while the fake location is still on. */
export const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000] as const

/** A long episode is reported again at most this often. */
export const REPORT_INTERVAL_MS = 15 * 60_000

export function retryDelay(attempts: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempts, 0), RETRY_DELAYS_MS.length - 1)]
}

/** A fix arrived from the tracker (or a one-off check). */
export function observeFix(
  state: MockWatchState,
  fix: { isMock: boolean; at: string },
  now: number,
): MockWatchState {
  if (fix.isMock) {
    if (state.active) return state
    return { active: true, since: fix.at, attempts: 0, nextCheckAt: now + retryDelay(0), reportedAt: null }
  }
  return state.active ? IDLE_MOCK_WATCH : state
}

/**
 * A re-check finished. `isMock` is the result of a fresh fix: false ends the episode, true keeps it,
 * null (no fix: no signal, timeout) keeps it too and simply tries again later.
 */
export function checkFinished(state: MockWatchState, isMock: boolean | null, now: number): MockWatchState {
  if (!state.active) return state
  if (isMock === false) return IDLE_MOCK_WATCH
  const attempts = state.attempts + 1
  return { ...state, attempts, nextCheckAt: now + retryDelay(attempts) }
}

/** The rep pressed "Check again": the next check runs now. */
export function checkRequested(state: MockWatchState, now: number): MockWatchState {
  return state.active ? { ...state, nextCheckAt: now } : state
}

export function reportDue(state: MockWatchState, now: number): boolean {
  return state.active && (state.reportedAt === null || now - state.reportedAt >= REPORT_INTERVAL_MS)
}

export function markReported(state: MockWatchState, now: number): MockWatchState {
  return state.active ? { ...state, reportedAt: now } : state
}

/** Whole seconds until the next automatic re-check (0 when due or idle). */
export function secondsUntilCheck(state: MockWatchState, now: number): number {
  if (!state.active || state.nextCheckAt === null) return 0
  return Math.max(0, Math.ceil((state.nextCheckAt - now) / 1000))
}
