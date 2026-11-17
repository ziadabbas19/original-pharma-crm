import { authLogin, authLogout, authMe, authRefresh } from '@/api/generated/endpoints'
import type { AuthResponse, ClientKind } from '@/api/generated/model'
import { configureApiClient } from '@/lib/api-client'
import { platform } from '@/lib/platform'
import { store } from '@/store'
import { sessionEnded, sessionStarted, userLoaded } from '@/store/slices/authSlice'
import { permissionsLoaded, serverVersionSeen } from '@/store/slices/permissionsSlice'

/**
 * Session handling for both clients:
 *   web    - refresh token is an httpOnly cookie; the page never sees it.
 *   native - refresh token is kept in Android Keystore secure storage.
 * Access tokens stay in memory (Redux) only.
 */

const REFRESH_TOKEN_KEY = 'auth.refreshToken'

let refreshing: Promise<boolean> | null = null
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
  await loadMe()
}

/** Single-flight refresh; concurrent 401s share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const native = clientKind() === 'native'
      const refreshToken = native ? await platform().secureStorage.get(REFRESH_TOKEN_KEY) : null
      if (native && !refreshToken) return false

      const { deviceId } = await platform().app.info()
      const response = await authRefresh({ client: clientKind(), refreshToken, deviceId })
      await applyAuthResponse(response)
      return true
    } catch {
      await clearLocalSession()
      return false
    }
  })().finally(() => (refreshing = null))
  return refreshing
}

/** Loads the profile and the effective permissions (with scopes). */
export function loadMe(): Promise<void> {
  meLoading ??= (async () => {
    const me = await authMe()
    store.dispatch(userLoaded(me.user))
    store.dispatch(permissionsLoaded({ version: me.permissionsVersion, grants: me.permissions }))
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
    if (await refreshSession()) {
      await loadMe().catch(() => clearLocalSession())
    } else {
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
  await platform().secureStorage.remove(REFRESH_TOKEN_KEY)
  store.dispatch(sessionEnded())
  bootstrapping = Promise.resolve()
}

/** Wire the fetch wrapper to the session. Called once at startup. */
export function connectApiClient(onSignedOut: () => void): void {
  configureApiClient({
    getAccessToken: () => store.getState().auth.accessToken,
    refreshSession,
    onUnauthorized: () => {
      void clearLocalSession().then(onSignedOut)
    },
    onPermissionsVersion: (version) => {
      const { permissions, auth } = store.getState()
      if (auth.status !== 'authenticated' || version <= permissions.serverVersion) return
      store.dispatch(serverVersionSeen(version))
      // Roles or overrides changed on the dashboard: pull the new grants.
      if (version > permissions.version) void loadMe().catch(() => {})
    },
  })
}
