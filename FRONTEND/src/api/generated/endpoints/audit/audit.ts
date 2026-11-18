/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import { useQuery } from '@tanstack/react-query'
import type {
  DataTag,
  DefinedInitialDataOptions,
  DefinedUseQueryResult,
  QueryClient,
  QueryFunction,
  QueryKey,
  UndefinedInitialDataOptions,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query'

import type { AuditEntryDto, AuditListParams } from '../../model'

import { apiFetch } from '../../../../lib/api-client'

type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1]

const withQueryKey = <T extends object, K>(query: T, queryKey: K): T & { queryKey: K } => {
  const result = { queryKey } as T & { queryKey: K }
  for (const key of Object.keys(query)) {
    // The explicit queryKey always wins, matching the previous
    // `{ ...query, queryKey }` spread where it was set last.
    if (key === 'queryKey') continue
    Object.defineProperty(result, key, {
      enumerable: true,
      configurable: true,
      get: () => (query as Record<string, unknown>)[key],
    })
  }
  return result
}

export const getAuditListUrl = (params?: AuditListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/audit?${stringifiedParams}` : `/api/audit`
}

export const auditList = async (
  params?: AuditListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<AuditEntryDto[]> => {
  return apiFetch<AuditEntryDto[]>(getAuditListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getAuditListQueryKey = (params?: AuditListParams) => {
  return [`/api/audit`, ...(params ? [params] : [])] as const
}

export const getAuditListQueryOptions = <TData = Awaited<ReturnType<typeof auditList>>, TError = unknown>(
  params?: AuditListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof auditList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getAuditListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof auditList>>> = ({ signal }) =>
    auditList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof auditList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type AuditListQueryResult = NonNullable<Awaited<ReturnType<typeof auditList>>>
export type AuditListQueryError = unknown

export function useAuditList<TData = Awaited<ReturnType<typeof auditList>>, TError = unknown>(
  params: undefined | AuditListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof auditList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof auditList>>,
          TError,
          Awaited<ReturnType<typeof auditList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useAuditList<TData = Awaited<ReturnType<typeof auditList>>, TError = unknown>(
  params?: AuditListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof auditList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof auditList>>,
          TError,
          Awaited<ReturnType<typeof auditList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useAuditList<TData = Awaited<ReturnType<typeof auditList>>, TError = unknown>(
  params?: AuditListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof auditList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useAuditList<TData = Awaited<ReturnType<typeof auditList>>, TError = unknown>(
  params?: AuditListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof auditList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getAuditListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
