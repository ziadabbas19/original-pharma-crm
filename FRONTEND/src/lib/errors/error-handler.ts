/**
 * The one place that understands errors. Features call handleError (or the helpers below); nothing
 * else inspects raw fetch or HTTP errors to decide what the user sees.
 *
 * - normalizeError turns anything thrown into an AppError with a kind the UI can act on.
 * - getErrorMessage gives the localized text: a translation of the API's problem code when there is
 *   one, a server message only when the API marked it safe to show, otherwise the generic text of
 *   the kind. Raw server text, stack traces and internals are never shown.
 * - handleError normalizes, logs in development, and shows one toast (identical toasts within a
 *   short window are dropped; offline toasts wait longer so a rep without network is not flooded).
 * - applyFieldErrors puts validation errors on form fields and returns what did not fit a field.
 *
 * 401 is handled by the session refresh in the API client: by the time an error reaches here as
 * "unauthorized" the refresh has already failed and the sign-in screen is on its way, so this only
 * reports it. 403 is a message, never a redirect.
 *
 * Runtime imports stay relative (no aliases, no i18n, no import.meta.env) so this file runs under
 * plain Node in the unit tests; the app wires translation and toasts in with configureErrorHandler.
 */
import {
  ApiError,
  ERROR_KINDS,
  NetworkError,
  UserFacingError,
  type AppError,
  type ErrorKind,
  type HandleErrorOptions,
  type ProblemDetails,
  type ToastRequest,
  type Translate,
  type TranslateLike,
} from './types.ts'

interface ErrorHandlerConfig {
  /** Translates handler messages (the app passes i18next's t). */
  translate: Translate
  /** Shows a toast (the app passes the toast store). */
  notify: (toast: ToastRequest) => void
  /** Logs to the console when true (development builds). */
  isDev: boolean
  /** Formats a percentage value that is already in percent (12.5 -> "12.5%"). */
  formatPercent: (value: number) => string
  now: () => number
}

const defaults: ErrorHandlerConfig = {
  translate: (key) => key,
  notify: () => {},
  isDev: false,
  formatPercent: (value) => `${value}%`,
  now: () => Date.now(),
}

let config: ErrorHandlerConfig = { ...defaults }

export function configureErrorHandler(next: Partial<ErrorHandlerConfig>): void {
  config = { ...config, ...next }
}

/** Back to the defaults and an empty toast history (tests). */
export function resetErrorHandler(): void {
  config = { ...defaults }
  recentToasts.clear()
}

/** Identical toasts inside this window are shown once. */
export const TOAST_DEDUPE_MS = 2_000

/** Offline toasts: at most one per this window, whatever the text. */
export const OFFLINE_TOAST_MS = 15_000

const RETRYABLE: ReadonlySet<ErrorKind> = new Set(['network', 'timeout', 'rateLimited', 'server'])

/**
 * Problem codes that only restate the HTTP status. Their text comes from the kind, so the same
 * situation reads the same everywhere.
 */
const GENERIC_CODES: ReadonlySet<string> = new Set([
  'unknown',
  'validation',
  'bad-request',
  'forbidden',
  'not-found',
  'server-error',
  'unauthenticated',
])

/** Problem fields that are not message parameters. */
const PROBLEM_KEYS: ReadonlySet<string> = new Set([
  'type',
  'title',
  'status',
  'detail',
  'code',
  'traceId',
  'errors',
  'safeToShow',
  'instance',
])

const NETWORK_FAILURE =
  /failed to fetch|networkerror|load failed|fetch failed|network request failed|network unavailable/i

// -------------------------------------------------------------------------------------------------
// normalizeError
// -------------------------------------------------------------------------------------------------

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'retryable' in value &&
    'original' in value &&
    ERROR_KINDS.includes((value as AppError).kind)
  )
}

/** Anything thrown -> an AppError. Already normalized errors are returned as they are. */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) return error
  if (error instanceof ApiError) return fromProblem(error.status, error.problem, error)
  if (looksLikeApiError(error)) return fromProblem(error.status, error.problem, error)
  if (isCancellation(error)) return make('cancelled', error, { message: 'Request cancelled' })
  if (isTimeout(error)) return make('timeout', error, { message: messageOf(error) || 'Request timed out' })
  if (error instanceof UserFacingError) {
    return make('validation', error, { message: error.message, safeMessage: error.message })
  }
  if (isNetworkFailure(error))
    return make('network', error, { message: messageOf(error) || 'Network unavailable' })
  if (error instanceof Error) return make('unknown', error, { message: error.message })
  if (typeof error === 'string') return make('unknown', error, { message: error })
  return make('unknown', error, { message: 'Unknown error' })
}

function make(kind: ErrorKind, original: unknown, fields: Partial<AppError> = {}): AppError {
  return {
    kind,
    status: null,
    code: null,
    message: '',
    fieldErrors: {},
    traceId: null,
    retryable: RETRYABLE.has(kind),
    safeMessage: null,
    details: {},
    original,
    ...fields,
  }
}

function fromProblem(status: number, problem: ProblemDetails, original: unknown): AppError {
  const code = typeof problem.code === 'string' && problem.code !== 'unknown' ? problem.code : null
  const fieldErrors = normalizeFieldErrors(problem.errors)
  const kind = kindOf(status, code, Object.keys(fieldErrors).length > 0)
  const title = typeof problem.title === 'string' ? problem.title : ''
  const details: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(problem)) {
    if (!PROBLEM_KEYS.has(key)) details[key] = value
  }
  // The body's title is shown only when the API wrote it for people; a 5xx never is.
  const safe = problem.safeToShow === true && status < 500 && title.length > 0
  return make(kind, original, {
    status,
    code,
    message: [status, code, title].filter(Boolean).join(' '),
    fieldErrors,
    traceId: typeof problem.traceId === 'string' ? problem.traceId : null,
    safeMessage: safe ? title : null,
    details: { ...details, title },
  })
}

function kindOf(status: number, code: string | null, hasFieldErrors: boolean): ErrorKind {
  if (status === 0) return 'network'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404 || status === 410) return 'notFound'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 429) return 'rateLimited'
  if (status >= 500) return 'server'
  if (hasFieldErrors || code === 'validation' || code === 'bad-request' || status === 400) return 'validation'
  if (status === 409 || status === 422) return 'conflict'
  return 'unknown'
}

/** Keys as the client sent them: "Points[0].Lat" -> "points[0].lat". */
function normalizeFieldErrors(errors: unknown): Record<string, string[]> {
  if (!errors || typeof errors !== 'object') return {}
  const result: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    const messages = (Array.isArray(value) ? value : [value]).filter(
      (m): m is string => typeof m === 'string' && m.length > 0,
    )
    if (messages.length === 0) continue
    const path = camelPath(key)
    result[path] = [...(result[path] ?? []), ...messages]
  }
  return result
}

function camelPath(path: string): string {
  return path
    .split('.')
    .map((segment) => (segment.length === 0 ? segment : segment[0].toLowerCase() + segment.slice(1)))
    .join('.')
}

function looksLikeApiError(value: unknown): value is { status: number; problem: ProblemDetails } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { name?: unknown }).name === 'ApiError' &&
    typeof (value as { status?: unknown }).status === 'number' &&
    typeof (value as { problem?: unknown }).problem === 'object'
  )
}

function isCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const name = (error as { name?: unknown }).name
  const message = (error as { message?: unknown }).message
  // AbortController.abort(), and TanStack Query's CancelledError (query cancelled or unmounted).
  return name === 'AbortError' || name === 'CancelledError' || message === 'CancelledError'
}

function isTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'TimeoutError'
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  if (!(error instanceof TypeError)) return false
  if (NETWORK_FAILURE.test(error.message)) return true
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : ''
}

/**
 * A refusal kept with a queued item (the offline outboxes store status, code and title) back as an
 * error the message helpers understand.
 */
export function restoreError(stored: {
  status: number
  code?: string
  title?: string
  safeToShow?: boolean
  maxDiscountPercent?: number
}): ApiError {
  return new ApiError(stored.status, { ...stored })
}

// -------------------------------------------------------------------------------------------------
// Messages
// -------------------------------------------------------------------------------------------------

const MISSING = '\u0000missing'

/** Localized text for the user. Empty for a cancelled request (nothing to tell). */
export function getErrorMessage(error: unknown, translate: TranslateLike = config.translate): string {
  const t = translate as Translate
  const e = normalizeError(error)
  if (e.kind === 'cancelled') return ''

  if (e.code && !GENERIC_CODES.has(e.code)) {
    const text = t(`errors.${e.code}`, { ...messageParams(e, t), defaultValue: MISSING })
    if (text && text !== MISSING) return text
  }
  if (e.safeMessage) return e.safeMessage
  return t(`errors.kind.${e.kind}`)
}

/** Values some code messages embed (who still holds a role, which permission, the discount cap). */
function messageParams(e: AppError, t: Translate): Record<string, unknown> {
  const { userCount, permission, maxDiscountPercent, title } = e.details
  return {
    detail: typeof title === 'string' ? title : '',
    userCount: typeof userCount === 'number' ? userCount : '',
    permission: typeof permission === 'string' ? permissionLabel(permission, t) : '',
    max: typeof maxDiscountPercent === 'number' ? config.formatPercent(maxDiscountPercent) : '',
  }
}

/** "users:read" -> its translated label (same keys as the roles page). */
function permissionLabel(key: string, t: Translate): string {
  const [resource, action] = key.split(':')
  return t(`permissionNames.${resource}.${action}`, { defaultValue: key })
}

/**
 * The server request id, for errors a user may need to report (server failures and anything
 * unexpected). Null otherwise.
 */
export function getErrorReference(error: unknown): string | null {
  const e = normalizeError(error)
  return e.kind === 'server' || e.kind === 'unknown' ? e.traceId : null
}

// -------------------------------------------------------------------------------------------------
// handleError
// -------------------------------------------------------------------------------------------------

const recentToasts = new Map<string, number>()

/** Normalizes, logs (development only) and shows one toast unless told not to. Returns the AppError. */
export function handleError(error: unknown, options: HandleErrorOptions = {}): AppError {
  const e = normalizeError(error)
  log(e, options.context)

  if (options.silent || options.toast === false || e.kind === 'cancelled') return e

  const message = typeof options.toast === 'string' ? options.toast : getErrorMessage(e)
  if (!message) return e
  const reference = getErrorReference(e)
  showOnce({
    tone: e.kind === 'network' ? 'warning' : 'error',
    message,
    reference: reference ? config.translate('errors.reference', { id: reference }) : undefined,
  })
  return e
}

function showOnce(toast: ToastRequest): void {
  const now = config.now()
  const offline = toast.tone === 'warning'
  const key = offline ? 'offline' : `${toast.tone}:${toast.message}`
  const window = offline ? OFFLINE_TOAST_MS : TOAST_DEDUPE_MS
  const last = recentToasts.get(key)
  if (last !== undefined && now - last < window) return
  recentToasts.set(key, now)
  // Keep the history small: drop entries that can no longer suppress anything.
  for (const [k, at] of recentToasts) if (now - at >= OFFLINE_TOAST_MS) recentToasts.delete(k)
  config.notify(toast)
}

function log(e: AppError, context: string | undefined): void {
  if (!config.isDev || e.kind === 'cancelled') return
  // Kind, status, code and request id only: no bodies, field values or tokens. A warning: the error
  // was handled (the user was told); console errors stay for real crashes.
  console.warn(`[error]${context ? ` ${context}` : ''}`, {
    kind: e.kind,
    status: e.status,
    code: e.code,
    traceId: e.traceId,
    message: e.message,
  })
}

// -------------------------------------------------------------------------------------------------
// Forms
// -------------------------------------------------------------------------------------------------

/**
 * Puts validation errors on form fields. Keys match the field names case-insensitively (the API
 * sends camelCase paths). `setError` receives the field name as listed in `fields` and the first
 * message. Returns the errors that matched no field.
 */
export function applyFieldErrors(
  error: unknown,
  setError: (field: string, message: string) => void,
  fields: readonly string[],
): Record<string, string[]> {
  const byName = new Map(fields.map((f) => [f.toLowerCase(), f]))
  const leftover: Record<string, string[]> = {}
  for (const [key, messages] of Object.entries(normalizeError(error).fieldErrors)) {
    const field = byName.get(key.toLowerCase())
    if (field && messages.length > 0) setError(field, messages[0])
    else leftover[key] = messages
  }
  return leftover
}
