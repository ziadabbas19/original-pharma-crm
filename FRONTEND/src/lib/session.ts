import { authLogin, authLogout, authMe, authRefresh } from '@/api/generated/endpoints'
import type { AuthResponse, ClientKind, MeResponse } from '@/api/generated/model'
import { configureApiClient, NetworkError } from '@/lib/api-client'
import { clearCache } from '@/lib/offline-cache'
import { platform } from '@/lib/platform'
import {
  deviceLabel,
  needsRefresh,
  onceUntilRearmed,
  refreshOutcomeOf,
  singleFlight,
  type RefreshOutcome,
} from '@/lib/session-refresh'
import { store } from '@/store'
import {
  discountCapLoaded,
  offlineSessionRestored,
  sessionEnded,
  sessionStarted,
  userLoaded,
} from '@/store/slices/authSlice'
import { permissionsLoaded, serverVersionSeen } from '@/store/slices/permissionsSlice'
import { stopCollection } from '@/features/tracking/collection'

/**
 * Session handling for both clients:
 *   web    - refresh token is an httpOnly cookie; the page never sees it.
 *   native - refresh token is kept in Android Keystore secure storage.
 * Access tokens stay in memory (Redux) only.
 *
 * The server keeps a device signed in for 30 days after its last use (90 at most): the app refreshes
 * silently on open, on return to the foreground and whenever a request finds the access token
 * expired. Offline, timeouts, server errors and rate limits never sign anyone out; only the server's
 * 401 to a refresh does (see session-refresh.ts).
 */

const REFRESH_TOKEN_KEY = 'auth.refreshToken'

/** Last profile and grants, so the rep app can open without network (see bootstrapSession). */
const ME_CACHE_KEY = 'op.session.me'

let bootstrapping: Promise<void> | null = null
let meLoading: Promise<void> | null = null

function clientKind(): ClientKind {
  return platform().kind === 'native' ? 'native' : 'web'
}

/** Device id and the name shown in the list of signed-in devices. */
async function device(): Promise<{ deviceId: string; deviceName: string }> {
  const info = await platform().app.info()
  return { deviceId: info.deviceId, deviceName: deviceLabel(info, navigator.userAgent) }
}

async function applyAuthResponse(response: AuthResponse): Promise<void> {
  if (response.refreshToken) {
    await platform().secureStorage.set(REFRESH_TOKEN_KEY, response.refreshToken)
  }
  store.dispatch(
    sessionStarted({ accessToken: response.accessToken, expiresAt: response.expiresAt, user: response.user }),
  )
}

export async function login(email: string, password: string): Promise<void> {
  const response = await authLogin({ email, password, client: clientKind(), ...(await device()) })
  signOut.rearm()
  await applyAuthResponse(response)
  if (!response.user.mustChangePassword) await loadMe()
}

/**
 * Single flight: every request that meets an expired access token waits for the same refresh.
 * Ends the session only on the server's definitive 401 (and only once, see signOut).
 */
const refresh = singleFlight(async (): Promise<RefreshOutcome> => {
  let outcome: RefreshOutcome
  try {
    const native = clientKind() === 'native'
    const refreshToken = native ? await platform().secureStorage.get(REFRESH_TOKEN_KEY) : null
    if (native && !refreshToken) {
      outcome = 'expired' // nothing stored on this device: there is no session to keep
    } else {
      const response = await authRefresh({ client: clientKind(), refreshToken, ...(await device()) })
      await applyAuthResponse(response)
      return 'ok'
    }
  } catch (e) {
    outcome = refreshOutcomeOf(e)
  }
  if (outcome === 'expired') await signOut.run()
  return outcome
})

export async function refreshSession(): Promise<boolean> {
  return (await refresh()) === 'ok'
}

/**
 * Ends the local session once, however many requests found out together. The sign-in screen is
 * opened only when someone was signed in; at start-up the route guard redirects by itself.
 */
const signOut = onceUntilRearmed(async () => {
  const wasSignedIn = store.getState().auth.status === 'authenticated'
  await clearLocalSession()
  if (wasSignedIn) onSessionEnded()
})

let onSessionEnded: () => void = () => {}

/**
 * Coming back to the app (and opening it): renew the access token if it is about to run out, so the
 * first screen does not wait on a 401. Offline the session simply stays as it is.
 */
function keepSessionFresh(): void {
  platform().app.onResume(() => {
    const { status, expiresAt } = store.getState().auth
    if (status === 'authenticated' && needsRefresh(expiresAt)) void refresh()
  })
}

/** Loads the profile and the effective permissions (with scopes). */
export function loadMe(): Promise<void> {
  meLoading ??= (async () => {
    const me = await authMe()
    applyMe(me)
    try {
      localStorage.setItem(ME_CACHE_KEY, JSON.stringify(me))
    } catch {
      // Without the copy the app simply needs network to start.
    }
  })().finally(() => (meLoading = null))
  return meLoading
}

/**
 * Restores the session on app start (once). Route guards await this.
 * Resolves when the user is known to be signed in or out (check store.getState().auth.status).
 * Rejects, keeping the stored session, when the server cannot answer and there is no copy of the
 * profile on the device; the route's error screen then offers to try again.
 */
export function bootstrapSession(): Promise<void> {
  bootstrapping ??= (async () => {
    if (store.getState().auth.status === 'authenticated') return
    const result = await refresh()
    if (result === 'ok') {
      // A temporary password only opens the change-password screen; the profile follows the change.
      if (store.getState().auth.user?.mustChangePassword) return
      try {
        await loadMe()
      } catch (error) {
        if (!restoreOfflineSession()) throw error
      }
    } else if (result === 'unavailable') {
      if (!restoreOfflineSession()) throw new NetworkError()
    } else {
      store.dispatch(sessionEnded())
    }
  })().catch((error: unknown) => {
    bootstrapping = null // the next navigation tries again
    throw error
  })
  return bootstrapping
}

export async function logout(): Promise<void> {
  try {
    const refreshToken =
      clientKind() === 'native' ? await platform().secureStorage.get(REFRESH_TOKEN_KEY) : null
    await authLogout({ refreshToken })
  } catch {
    // Server unreachable: still clear locally.
  }
  await clearLocalSession()
}

async function clearLocalSession(): Promise<void> {
  // Nothing keeps collecting locations for someone who signed out.
  await stopCollection()
  await platform().secureStorage.remove(REFRESH_TOKEN_KEY)
  try {
    localStorage.removeItem(ME_CACHE_KEY)
  } catch {
    // ignore
  }
  clearCache()
  store.dispatch(sessionEnded())
  bootstrapping = Promise.resolve()
}

function applyMe(me: MeResponse): void {
  store.dispatch(userLoaded(me.user))
  store.dispatch(discountCapLoaded(me.maxDiscountPercent ?? null))
  store.dispatch(permissionsLoaded({ version: me.permissionsVersion, grants: me.permissions }))
}

/**
 * No network at start-up: continue as the last signed-in user without an access token. The first
 * request once online gets a 401, refreshes with the stored refresh token and retries.
 */
function restoreOfflineSession(): boolean {
  try {
    const raw = localStorage.getItem(ME_CACHE_KEY)
    if (!raw) return false
    const me = JSON.parse(raw) as MeResponse
    store.dispatch(offlineSessionRestored(me.user))
    applyMe(me)
    return true
  } catch {
    return false
  }
}

/** Wire the fetch wrapper to the session. Called once at startup. */
export function connectApiClient(onSignedOut: () => void, onPasswordChangeRequired: () => void): void {
  onSessionEnded = onSignedOut
  keepSessionFresh()
  configureApiClient({
    getAccessToken: () => store.getState().auth.accessToken,
    refreshSession: refresh,
    // The refresh already signed out (once); requests that failed alongside have nothing more to do.
    onUnauthorized: () => void signOut.run(),
    onPasswordChangeRequired: () => {
      // Reset by a manager during this session: the next screen is the change-password form.
      const { user } = store.getState().auth
      if (user && !user.mustChangePassword) store.dispatch(userLoaded({ ...user, mustChangePassword: true }))
      onPasswordChangeRequired()
    },
    onPermissionsVersion: (version) => {
      const { permissions, auth } = store.getState()
      if (auth.status !== 'authenticated' || auth.user?.mustChangePassword) return
      if (version <= permissions.serverVersion) return
      store.dispatch(serverVersionSeen(version))
      // Roles or overrides changed on the dashboard: pull the new grants.
      if (version > permissions.version) void loadMe().catch(() => {})
    },
  })
}
