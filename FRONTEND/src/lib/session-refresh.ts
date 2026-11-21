/**
 * Rules of the session refresh, kept free of app wiring so they can be tested alone (see session.ts).
 *
 * A session lasts while the device is used (the server slides it 30 days forward on every refresh),
 * so the client must never give it up for a passing problem: being offline, a timeout, a 5xx or a
 * rate limit keeps the session and the refresh is tried again later. Only the server's definitive
 * answer, 401 (the refresh token is invalid, expired, revoked or reused), ends it.
 */
import { ApiError } from './errors/types.ts'

/** ok: new access token. expired: the server ended the session. unavailable: try again later. */
export type RefreshOutcome = 'ok' | 'expired' | 'unavailable'

export function refreshOutcomeOf(error: unknown): RefreshOutcome {
  return error instanceof ApiError && error.status === 401 ? 'expired' : 'unavailable'
}

/** Calls `run` once at a time: callers that arrive while it runs share the same promise. */
export function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    pending ??= run().finally(() => {
      pending = null
    })
    return pending
  }
}

/**
 * Runs `end` once per signed-in period: many requests failing together after the session ended
 * sign the user out (and navigate) a single time. `rearm` is called at the next sign-in.
 */
export function onceUntilRearmed(end: () => Promise<void>): { run: () => Promise<void>; rearm: () => void } {
  let ending: Promise<void> | null = null
  return {
    run: () => (ending ??= end()),
    rearm: () => {
      ending = null
    },
  }
}

/** Refresh ahead of expiry when the app comes back: tokens that end within this window are renewed. */
export const REFRESH_AHEAD_MS = 60_000

export function needsRefresh(expiresAt: string | null, now: number = Date.now()): boolean {
  if (!expiresAt) return true
  const at = Date.parse(expiresAt)
  return Number.isNaN(at) || at - now <= REFRESH_AHEAD_MS
}

/** What the device is, for the list of signed-in devices ("Samsung SM-A546E", "Chrome on Windows"). */
export function deviceLabel(
  info: { isNative: boolean; manufacturer: string | null; model: string | null },
  userAgent = '',
): string {
  if (info.isNative) {
    const name = [info.manufacturer, info.model].filter(Boolean).join(' ').trim()
    return name || 'Android'
  }
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /SamsungBrowser\//.test(userAgent)
        ? 'Samsung Internet'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Chrome\//.test(userAgent)
            ? 'Chrome'
            : /Safari\//.test(userAgent)
              ? 'Safari'
              : 'Browser'
  const system = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent)
      ? 'iOS'
      : /Windows/.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : ''
  return system ? `${browser} on ${system}` : browser
}
