import type { LocationTrustSettingsDto, UpdateLocationTrustSettingsRequest } from '../../api/generated/model'

/** Location trust settings as typed in the form; mirrors UpdateLocationTrustSettingsRequestValidator. */

export type NumericField = Exclude<keyof UpdateLocationTrustSettingsRequest, 'mockPolicy' | 'visibility'>

export const FIELD_RULES: Record<
  NumericField,
  { min: number; max: number; step: number; integer?: boolean }
> = {
  maxSpeedKmh: { min: 60, max: 1000, step: 10 },
  maxDistanceFromDoctorMeters: { min: 50, max: 10_000, step: 50 },
  accuracyAllowanceMeters: { min: 0, max: 200, step: 5 },
  lowTrustAccuracyMeters: { min: 10, max: 500, step: 5 },
  perfectAccuracyMeters: { min: 0, max: 10, step: 0.5 },
  repeatedAccuracyRun: { min: 3, max: 50, step: 1, integer: true },
  deviceSignalsRetentionDays: { min: 1, max: 365, step: 1, integer: true },
  driftFromClinicMeters: { min: 20, max: 10_000, step: 10 },
  driftFromVisitsMeters: { min: 20, max: 10_000, step: 10 },
  visitWindowBufferMinutes: { min: 0, max: 60, step: 1, integer: true },
}

export const NUMERIC_FIELDS = Object.keys(FIELD_RULES) as NumericField[]

export type LocationTrustDraft = Record<NumericField, string> &
  Pick<UpdateLocationTrustSettingsRequest, 'mockPolicy'> & {
    visibility: NonNullable<UpdateLocationTrustSettingsRequest['visibility']>
  }

export function draftOf(settings: LocationTrustSettingsDto): LocationTrustDraft {
  const draft = { mockPolicy: settings.mockPolicy, visibility: settings.visibility } as LocationTrustDraft
  for (const field of NUMERIC_FIELDS) draft[field] = String(settings[field] ?? '')
  return draft
}

/** The field's problem, or null when the value is acceptable. */
export function fieldError(field: NumericField, raw: string): 'required' | 'range' | 'integer' | null {
  const text = raw.trim()
  if (text === '') return 'required'
  const value = Number(text)
  if (!Number.isFinite(value)) return 'range'
  const rule = FIELD_RULES[field]
  if (rule.integer && !Number.isInteger(value)) return 'integer'
  return value < rule.min || value > rule.max ? 'range' : null
}

/** The request to send, or null while a field is wrong. */
export function requestOf(draft: LocationTrustDraft): UpdateLocationTrustSettingsRequest | null {
  if (NUMERIC_FIELDS.some((field) => fieldError(field, draft[field]) !== null)) return null
  const request = {
    mockPolicy: draft.mockPolicy,
    visibility: draft.visibility,
  } as UpdateLocationTrustSettingsRequest
  for (const field of NUMERIC_FIELDS) request[field] = Number(draft[field].trim())
  return request
}
