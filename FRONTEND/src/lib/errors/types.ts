import type { TFunction } from 'i18next'

/**
 * Error types shared by the API client and the error handler. Kept free of app wiring (no aliases,
 * no i18n, no environment access) so the handler can be unit tested with plain Node.
 */

/** What went wrong, in the terms the UI cares about. */
export type ErrorKind =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'validation'
  | 'rateLimited'
  | 'server'
  | 'cancelled'
  | 'unknown'

export const ERROR_KINDS: readonly ErrorKind[] = [
  'network',
  'timeout',
  'unauthorized',
  'forbidden',
  'notFound',
  'conflict',
  'validation',
  'rateLimited',
  'server',
  'cancelled',
  'unknown',
]

/** RFC 7807 body the API returns for every failed request (see GlobalExceptionHandler). */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  /** Stable machine-readable code, e.g. "visit-in-progress" or "role_in_use". */
  code?: string
  traceId?: string
  /** Field errors of a validation failure, keyed by camelCase field path. */
  errors?: Record<string, string[]>
  /** Set by the API when `title` was written for end users (business rules, conflicts). */
  safeToShow?: boolean
  [key: string]: unknown
}

/** A response with an error status. Thrown by the API client. */
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

/**
 * The request never reached the server (offline, DNS, connection reset) or the session could not be
 * refreshed for the same reason. Extends TypeError because that is what fetch itself throws.
 */
export class NetworkError extends TypeError {
  constructor(message = 'Network unavailable', options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'NetworkError'
  }
}

/** An error whose message is already translated for the user (client-side checks). */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

/** The normalized form of any error the app can meet. */
export interface AppError {
  kind: ErrorKind
  /** HTTP status, or null when no response arrived. */
  status: number | null
  /** The API's problem code, or null. */
  code: string | null
  /** Technical summary for logs. Never shown to the user as it is; see getErrorMessage. */
  message: string
  /** Validation errors by camelCase field path (empty when there are none). */
  fieldErrors: Record<string, string[]>
  /** Server request id the user can quote to support (null without a response). */
  traceId: string | null
  /** True when trying the same request again later can succeed. */
  retryable: boolean
  /** Text written for the user: a server message marked safe to show, or a client-side check. */
  safeMessage: string | null
  /** Extra values of the problem body some messages use (userCount, permission, ...). */
  details: Record<string, unknown>
  original: unknown
}

export interface HandleErrorOptions {
  /** Normalize and log only; no toast. */
  silent?: boolean
  /** Text to show instead of the derived message, or false for no toast. */
  toast?: string | false
  /** Where the error happened (logged in development, e.g. "users.create"). */
  context?: string
}

/** Minimal translate function. */
export type Translate = (key: string, options?: Record<string, unknown>) => string

/** What message helpers accept: i18next's `t` or a plain translate function. */
export type TranslateLike = Translate | TFunction

export type ToastTone = 'error' | 'warning' | 'info' | 'success'

export interface ToastRequest {
  tone: ToastTone
  message: string
  /** Small "reference" line for support (trace id). */
  reference?: string
  /** One button next to the message (e.g. open the note a reminder is about). */
  action?: { label: string; onClick: () => void }
}
