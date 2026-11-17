import type { TFunction } from 'i18next'
import { formatNumber } from '@/lib/format'
import { MAX_LEVEL } from './role-rules'

/** Limits from BACKEND Domain/Identity/Role.cs. */
export const NAME_MAX = 100
export const DESCRIPTION_MAX = 256

export function nameError(value: string, t: TFunction): string | undefined {
  if (!value.trim()) return t('forms.required')
  return value.trim().length > NAME_MAX ? t('forms.maxLength', { count: NAME_MAX }) : undefined
}

/** Checks a level typed into a number input; returns a translated error or undefined. */
export function levelError(value: string, min: number, t: TFunction): string | undefined {
  const level = Number(value)
  if (value.trim() === '' || !Number.isInteger(level)) return t('roles.form.levelInvalid')
  if (level < min || level > MAX_LEVEL) {
    return t('roles.form.levelRange', { min: formatNumber(min), max: formatNumber(MAX_LEVEL) })
  }
  return undefined
}
