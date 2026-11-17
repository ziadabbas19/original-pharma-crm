/**
 * Fetch wrapper used by every API function in src/api/generated (see orval.config.ts).
 *
 * - Prefixes VITE_API_BASE_URL (empty in web dev: Vite proxies /api to the backend).
 * - Adds the Bearer access token.
 * - Sends cookies (web refresh token lives in an httpOnly cookie on /api/auth).
 * - On 401 refreshes the session once and retries.
 * - Watches X-Permissions-Version so permission edits from the dashboard apply quickly.
 */

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** Absolute URL for a path the API returned (e.g. an image URL). Null stays null. */
export function apiAssetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return /^https?:/.test(path) ? path : `${API_BASE_URL}${path}`
}

export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  code?: string
  errors?: Record<string, string[]>
  [key: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly problem: ProblemDetails

  constructor(status: number, problem: ProblemDetails) {
    super(problem.title ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = problem.code ?? 'unknown'
    this.problem = problem
  }
}

interface ApiClientHooks {
  getAccessToken: () => string | null
  /** 'ok' when a new access token is available; 'offline' when the refresh could not reach the server. */
  refreshSession: () => Promise<'ok' | 'expired' | 'offline'>
  onPermissionsVersion: (version: number) => void
  onUnauthorized: () => void
}

let hooks: ApiClientHooks = {
  getAccessToken: () => null,
  refreshSession: async () => 'expired',
  onPermissionsVersion: () => {},
  onUnauthorized: () => {},
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
    // Keep the session when the server cannot be reached; callers see a network error.
    if (refreshed === 'offline') throw new TypeError('Network unavailable')
    hooks.onUnauthorized()
  }

  return parse<T>(response)
}

async function send(url: string, options: RequestInit): Promise<Response> {
  const headers = new Headers(options.headers)
  const token = hooks.getAccessToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  headers.set('Accept', 'application/json')

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  })

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
