import { useCustomersSimilar } from '@/api/generated/endpoints'
import type { CustomerType, SimilarCustomerDto } from '@/api/generated/model'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useOnline } from '@/hooks/use-online'
import { similarParams } from './similar-customers'

/**
 * Existing customers of the same type in the chosen town that look like the one being typed, checked
 * while typing (debounced) and again when the town changes. Skipped while offline: the add forms need a
 * connection anyway, and the server checks again when saving.
 */
export function useSimilarCustomers({
  type,
  name,
  townId,
  phone,
  enabled,
}: {
  type: CustomerType
  name: string
  townId: string
  phone?: string
  enabled: boolean
}): SimilarCustomerDto[] {
  const online = useOnline()
  const typed = useDebouncedValue(name, 400)
  const dialed = useDebouncedValue(phone ?? '', 400)
  const params = similarParams(type, typed, townId, dialed)
  const similar = useCustomersSimilar(params ?? undefined, {
    query: { enabled: enabled && online && params !== null, staleTime: 30_000 },
  })
  return enabled && online && params !== null ? (similar.data ?? []) : []
}
