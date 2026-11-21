/**
 * Fetch wrapper used by every API function in src/api/generated (see orval.config.ts).
 *
 * - Prefixes VITE_API_BASE_URL (empty in web dev: Vite proxies /api to the backend).
 * - Adds the Bearer access token.
 * - Sends cookies (web refresh token lives in an httpOnly cookie on /api/auth).
 * - On 401 refreshes the session once and retries.
 * - Watches X-Permissions-Version so permission edits from the dashboard apply quickly.
 * - Reports when the API refuses a request because the password is temporary.
 * - Throws ApiError for error responses and NetworkError when the server cannot be reached; what the
 *   user sees is decided by lib/errors/error-handler.ts.
 */
// Relative import and optional env access: this file also runs under plain Node in the unit tests.
import { ApiError, NetworkError, type ProblemDetails } from './errors/types.ts'

export { ApiError, NetworkError, type ProblemDetails }

export const API_BASE_URL: string = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** Problem code of a request refused until the temporary password is replaced. */
const PASSWORD_CHANGE_REQUIRED = 'password_change_required'

/** Absolute URL for a path the API returned (e.g. an image URL). Null stays null. */
export function apiAssetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return /^https?:/.test(path) ? path : `${API_BASE_URL}${path}`
}

interface ApiClientHooks {
  getAccessToken: () => string | null
  /**
   * 'ok' when a new access token is available; 'expired' when the server ended the session;
   * 'unavailable' when it could not answer (offline, timeout, 5xx, rate limit): the session is kept.
   */
  refreshSession: () => Promise<'ok' | 'expired' | 'unavailable'>
  onPermissionsVersion: (version: number) => void
  onUnauthorized: () => void
  onPasswordChangeRequired: () => void
}

let hooks: ApiClientHooks = {
  getAccessToken: () => null,
  refreshSession: async () => 'expired',
  onPermissionsVersion: () => {},
  onUnauthorized: () => {},
  onPasswordChangeRequired: () => {},
}

export function configureApiClient(next: ApiClientHooks): void {
  hooks = next
}

const AUTH_PATHS = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout']

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await send(url, options)

  if (response.status === 401 && !AUTH_PATHS.some((p) => url.startsWith(p))) {
    const refreshed = await hooks.refreshSession()
    if (refreshed === 'ok') {
      return parse<T>(await send(url, options))
    }
    // Keep the session when the server cannot answer; callers see a network error and retry later.
    if (refreshed === 'unavailable') throw new NetworkError()
    // The refresh failed for good: the session layer signs out (once) and this request reports 401.
    hooks.onUnauthorized()
  }

  return parse<T>(response)
}

/** Binary responses behind sign-in (visit photos), which an <img> tag cannot request by itself. */
export async function apiFetchBlob(url: string): Promise<Blob> {
  let response = await send(url, {})
  if (response.status === 401) {
    const refreshed = await hooks.refreshSession()
    if (refreshed === 'unavailable') throw new NetworkError()
    if (refreshed === 'expired') {
      hooks.onUnauthorized()
      throw new ApiError(401, { status: 401, code: 'invalid-refresh-token' })
    }
    response = await send(url, {})
  }
  if (!response.ok)
    throw new ApiError(response.status, { status: response.status, title: response.statusText })
  return response.blob()
}

async function send(url: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers)
  const token = hooks.getAccessToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  headers.set('Accept', 'application/json')

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch (error) {
    // Aborts and timeouts keep their own names; anything else means the server was not reached.
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError'))
      throw error
    throw new NetworkError(error instanceof Error ? error.message : undefined, { cause: error })
  }

  const version = response.headers.get('X-Permissions-Version')
  if (version) {
    hooks.onPermissionsVersion(Number(version))
  }

  return response
}

async function parse<T>(response: Response): Promise<T> {
  const text = response.status === 204 ? '' : await response.text()
  const body: unknown = text ? safeJson(text) : undefined

  if (!response.ok) {
    const problem: ProblemDetails =
      body && typeof body === 'object' ? (body as ProblemDetails) : { title: response.statusText }
    if (problem.code === PASSWORD_CHANGE_REQUIRED) hooks.onPasswordChangeRequired()
    throw new ApiError(response.status, { status: response.status, ...problem })
  }

  return body as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export default apiFetch
