import type {
  CustomersSimilarParams,
  CustomerType,
  SimilarCustomerDto,
} from '../../api/generated/model/index.ts'

/** Letters of a name before the live duplicate check runs (the server's rules need three). */
export const SIMILAR_MIN_LENGTH = 3

/** Digits of a phone number before it counts on its own (the server ignores shorter ones). */
const PHONE_MIN_DIGITS = 6

/**
 * The live "similar ones already exist" query for an add form, or null while there is not enough to
 * compare: a town and either a name of three letters or a phone number.
 */
export function similarParams(
  type: CustomerType,
  name: string,
  townId: string,
  phone = '',
): CustomersSimilarParams | null {
  const text = name.trim()
  const number = phone.trim()
  const digits = number.replace(/\D/g, '').length
  if (!townId || (text.length < SIMILAR_MIN_LENGTH && digits < PHONE_MIN_DIGITS)) return null
  return {
    Type: type,
    TerritoryId: townId,
    ...(text ? { Name: text } : {}),
    ...(digits >= PHONE_MIN_DIGITS ? { Phone: number } : {}),
  }
}

/** The candidates of a 409 `duplicate_suspected`, or null for any other failure. */
export function duplicateCandidates(failure: {
  code: string | null
  details: Record<string, unknown>
}): SimilarCustomerDto[] | null {
  return failure.code === 'duplicate_suspected' && Array.isArray(failure.details.candidates)
    ? (failure.details.candidates as SimilarCustomerDto[])
    : null
}
