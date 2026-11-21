export {
  applyFieldErrors,
  configureErrorHandler,
  getErrorMessage,
  getErrorReference,
  handleError,
  isAppError,
  normalizeError,
  restoreError,
} from './error-handler.ts'
export { useFormErrors, type FormErrors } from './use-form-errors.ts'

/**
 * Options for a generated mutation hook whose screen shows the error itself (a form or dialog):
 * the global mutation toast stays quiet. Example: useUsersUpdate(inlineErrors).
 */
export const inlineErrors = { mutation: { meta: { silent: true } } } as const
export {
  ApiError,
  NetworkError,
  UserFacingError,
  type AppError,
  type ErrorKind,
  type HandleErrorOptions,
  type ProblemDetails,
} from './types.ts'
