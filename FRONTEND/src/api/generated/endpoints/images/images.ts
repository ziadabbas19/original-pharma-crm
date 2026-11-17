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

import type { ProblemDetails } from '../../model'

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

export const getImagesGetUrl = (key: string, variant: string) => {
  return `/api/images/${key}/${variant}.webp`
}

export const imagesGet = async (
  key: string,
  variant: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<Blob> => {
  return apiFetch<Blob>(getImagesGetUrl(key, variant), {
    ...options,
    method: 'GET',
  })
}

export const getImagesGetQueryKey = (key: string, variant: string) => {
  return [`/api/images/${key}/${variant}.webp`] as const
}

export const getImagesGetQueryOptions = <
  TData = Awaited<ReturnType<typeof imagesGet>>,
  TError = void | ProblemDetails,
>(
  key: string,
  variant: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof imagesGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getImagesGetQueryKey(key, variant)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof imagesGet>>> = ({ signal }) =>
    imagesGet(key, variant, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: key !== null && key !== undefined && variant !== null && variant !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof imagesGet>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type ImagesGetQueryResult = NonNullable<Awaited<ReturnType<typeof imagesGet>>>
export type ImagesGetQueryError = void | ProblemDetails

export function useImagesGet<TData = Awaited<ReturnType<typeof imagesGet>>, TError = void | ProblemDetails>(
  key: string,
  variant: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof imagesGet>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof imagesGet>>,
          TError,
          Awaited<ReturnType<typeof imagesGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useImagesGet<TData = Awaited<ReturnType<typeof imagesGet>>, TError = void | ProblemDetails>(
  key: string,
  variant: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof imagesGet>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof imagesGet>>,
          TError,
          Awaited<ReturnType<typeof imagesGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useImagesGet<TData = Awaited<ReturnType<typeof imagesGet>>, TError = void | ProblemDetails>(
  key: string,
  variant: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof imagesGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useImagesGet<TData = Awaited<ReturnType<typeof imagesGet>>, TError = void | ProblemDetails>(
  key: string,
  variant: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof imagesGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getImagesGetQueryOptions(key, variant, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
