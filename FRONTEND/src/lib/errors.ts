import type { TFunction } from 'i18next'
import i18n from '@/lib/i18n'
import { ApiError } from '@/lib/api-client'
import { formatPercent } from '@/lib/format'

/** An error whose message is already translated for the user (client-side checks). */
export class UserFacingError extends Error {}

/**
 * User-facing text for a failed request. Known server codes (ProblemDetails
 * "code") have their own translation under `errors.*`; otherwise the HTTP
 * status decides, and the server title is the last resort.
 */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof UserFacingError) return error.message
  if (!(error instanceof ApiError)) {
    return error instanceof TypeError ? t('errors.network') : t('common.error')
  }

  const key = `errors.${error.code}`
  // Some messages embed the server's explanation (why a user could not be created) or
  // values from the response (how many users still hold a role, which permission).
  if (error.code !== 'unknown' && i18n.exists(key)) {
    const { userCount, permission, maxDiscountPercent } = error.problem
    return t(key, {
      detail: error.problem.title ?? '',
      userCount: typeof userCount === 'number' ? userCount : '',
      permission: typeof permission === 'string' ? permissionText(permission, t) : '',
      max: typeof maxDiscountPercent === 'number' ? formatPercent(maxDiscountPercent) : '',
    })
  }
  if (error.status === 403) return t('errors.forbidden')
  if (error.status === 404) return t('errors.not-found')
  if (error.status >= 500) return t('errors.server-error')
  return error.problem.title ?? t('common.error')
}

/** Field errors from a 400 validation response, keyed by camelCase field path. */
export function fieldErrors(error: unknown): Record<string, string[]> {
  if (error instanceof ApiError && error.problem.errors) return error.problem.errors
  return {}
}

/** "users:read" -> its translated label (same keys as the roles page). */
function permissionText(key: string, t: TFunction): string {
  const [resource, action] = key.split(':')
  return t(`permissionNames.${resource}.${action}`, { defaultValue: key })
}
