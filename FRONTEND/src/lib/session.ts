import { authLogin, authLogout, authMe, authRefresh } from '@/api/generated/endpoints'
import type { AuthResponse, ClientKind, MeResponse } from '@/api/generated/model'
import { ApiError, configureApiClient } from '@/lib/api-client'
import { clearCache } from '@/lib/offline-cache'
import { platform } from '@/lib/platform'
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
 */

const REFRESH_TOKEN_KEY = 'auth.refreshToken'

/** Last profile and grants, so the rep app can open without network (see bootstrapSession). */
const ME_CACHE_KEY = 'op.session.me'

type RefreshResult = 'ok' | 'expired' | 'offline'

let refreshing: Promise<RefreshResult> | null = null
let bootstrapping: Promise<void> | null = null
let meLoading: Promise<void> | null = null

function clientKind(): ClientKind {
  return platform().kind === 'native' ? 'native' : 'web'
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
  const { deviceId } = await platform().app.info()
  const response = await authLogin({ email, password, client: clientKind(), deviceId })
  await applyAuthResponse(response)
  if (!response.user.mustChangePassword) await loadMe()
}

/**
 * Single-flight refresh; concurrent 401s share one request. A refused refresh ends the session;
 * no network (or a server error) keeps it, so an offline rep is not signed out.
 */
function refresh(): Promise<RefreshResult> {
  refreshing ??= (async (): Promise<RefreshResult> => {
    try {
      const native = clientKind() === 'native'
      const refreshToken = native ? await platform().secureStorage.get(REFRESH_TOKEN_KEY) : null
      if (native && !refreshToken) {
        await clearLocalSession()
        return 'expired'
      }

      const { deviceId } = await platform().app.info()
      const response = await authRefresh({ client: clientKind(), refreshToken, deviceId })
      await applyAuthResponse(response)
      return 'ok'
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        await clearLocalSession()
        return 'expired'
      }
      return 'offline'
    }
  })().finally(() => (refreshing = null))
  return refreshing
}

export async function refreshSession(): Promise<boolean> {
  return (await refresh()) === 'ok'
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
 * Resolves in both cases; check store.getState().auth.status afterwards.
 */
export function bootstrapSession(): Promise<void> {
  bootstrapping ??= (async () => {
    if (store.getState().auth.status === 'authenticated') return
    const result = await refresh()
    if (result === 'ok') {
      // A temporary password only opens the change-password screen; the profile follows the change.
      if (store.getState().auth.user?.mustChangePassword) return
      await loadMe().catch(() => (restoreOfflineSession() ? undefined : clearLocalSession()))
    } else if (result !== 'offline' || !restoreOfflineSession()) {
      store.dispatch(sessionEnded())
    }
  })()
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
  configureApiClient({
    getAccessToken: () => store.getState().auth.accessToken,
    refreshSession: refresh,
    onUnauthorized: () => {
      void clearLocalSession().then(onSignedOut)
    },
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
