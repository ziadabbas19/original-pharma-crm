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

import type { TerritoryDto } from '../../model'

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

export const getTerritoriesListUrl = () => {
  return `/api/territories`
}

export const territoriesList = async (options?: Parameters<typeof apiFetch>[1]): Promise<TerritoryDto[]> => {
  return apiFetch<TerritoryDto[]>(getTerritoriesListUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getTerritoriesListQueryKey = () => {
  return [`/api/territories`] as const
}

export const getTerritoriesListQueryOptions = <
  TData = Awaited<ReturnType<typeof territoriesList>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof territoriesList>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTerritoriesListQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof territoriesList>>> = ({ signal }) =>
    territoriesList({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof territoriesList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type TerritoriesListQueryResult = NonNullable<Awaited<ReturnType<typeof territoriesList>>>
export type TerritoriesListQueryError = unknown

export function useTerritoriesList<TData = Awaited<ReturnType<typeof territoriesList>>, TError = unknown>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof territoriesList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof territoriesList>>,
          TError,
          Awaited<ReturnType<typeof territoriesList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTerritoriesList<TData = Awaited<ReturnType<typeof territoriesList>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof territoriesList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof territoriesList>>,
          TError,
          Awaited<ReturnType<typeof territoriesList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTerritoriesList<TData = Awaited<ReturnType<typeof territoriesList>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof territoriesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTerritoriesList<TData = Awaited<ReturnType<typeof territoriesList>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof territoriesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTerritoriesListQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
