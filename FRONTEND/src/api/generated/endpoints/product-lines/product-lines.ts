/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import type {
  DataTag,
  DefinedInitialDataOptions,
  DefinedUseQueryResult,
  MutationFunction,
  QueryClient,
  QueryFunction,
  QueryKey,
  UndefinedInitialDataOptions,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from '@tanstack/react-query'

import type { ProductLineDto, ProductLinesListParams, SaveProductLineRequest } from '../../model'

import { apiFetch } from '../../../../lib/api-client'

type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1]

const getHeaders = (...sources: (RequestInit['headers'] | Record<string, string | undefined>)[]) => {
  const seen = new Set<string>()
  const layers: [string, string | readonly string[]][][] = []
  for (const source of sources.reverse()) {
    if (!source) continue
    const entries =
      source instanceof Headers
        ? source.entries()
        : Symbol.iterator in source
          ? Array.from(source as Iterable<Iterable<string>>, (entry) => Array.from(entry) as [string, string])
          : Object.entries<string | readonly string[] | undefined>(source)
    const layer: [string, string | readonly string[]][] = []
    for (const [name, value] of entries) {
      if (value !== undefined && !seen.has(name.toLowerCase())) layer.push([name, value])
    }
    for (const [name] of layer) seen.add(name.toLowerCase())
    layers.push(layer)
  }
  return Object.fromEntries(layers.reverse().flat()) as Extract<
    RequestInit['headers'],
    Record<string, unknown>
  >
}

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

export const getProductLinesListUrl = (params?: ProductLinesListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/product-lines?${stringifiedParams}` : `/api/product-lines`
}

export const productLinesList = async (
  params?: ProductLinesListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductLineDto[]> => {
  return apiFetch<ProductLineDto[]>(getProductLinesListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getProductLinesListQueryKey = (params?: ProductLinesListParams) => {
  return [`/api/product-lines`, ...(params ? [params] : [])] as const
}

export const getProductLinesListQueryOptions = <
  TData = Awaited<ReturnType<typeof productLinesList>>,
  TError = unknown,
>(
  params?: ProductLinesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productLinesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getProductLinesListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof productLinesList>>> = ({ signal }) =>
    productLinesList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof productLinesList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type ProductLinesListQueryResult = NonNullable<Awaited<ReturnType<typeof productLinesList>>>
export type ProductLinesListQueryError = unknown

export function useProductLinesList<TData = Awaited<ReturnType<typeof productLinesList>>, TError = unknown>(
  params: undefined | ProductLinesListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof productLinesList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof productLinesList>>,
          TError,
          Awaited<ReturnType<typeof productLinesList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductLinesList<TData = Awaited<ReturnType<typeof productLinesList>>, TError = unknown>(
  params?: ProductLinesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productLinesList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof productLinesList>>,
          TError,
          Awaited<ReturnType<typeof productLinesList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductLinesList<TData = Awaited<ReturnType<typeof productLinesList>>, TError = unknown>(
  params?: ProductLinesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productLinesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductLinesList<TData = Awaited<ReturnType<typeof productLinesList>>, TError = unknown>(
  params?: ProductLinesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productLinesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getProductLinesListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getProductLinesCreateUrl = () => {
  return `/api/product-lines`
}

export const productLinesCreate = async (
  saveProductLineRequest: SaveProductLineRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductLineDto> => {
  return apiFetch<ProductLineDto>(getProductLinesCreateUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveProductLineRequest),
  })
}

export const getProductLinesCreateMutationKey = () => ['productLinesCreate'] as const

export const getProductLinesCreateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productLinesCreate>>,
    TError,
    ProductLinesCreateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productLinesCreate>>,
  TError,
  ProductLinesCreateMutationVariables,
  TContext
> => {
  const mutationKey = getProductLinesCreateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productLinesCreate>>,
    ProductLinesCreateMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return productLinesCreate(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductLinesCreateMutationResult = NonNullable<Awaited<ReturnType<typeof productLinesCreate>>>
export type ProductLinesCreateMutationBody = SaveProductLineRequest
export type ProductLinesCreateMutationError = unknown
export type ProductLinesCreateMutationVariables = { data: SaveProductLineRequest }

export const useProductLinesCreate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productLinesCreate>>,
      TError,
      ProductLinesCreateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productLinesCreate>>,
  TError,
  ProductLinesCreateMutationVariables,
  TContext
> => {
  return useMutation(getProductLinesCreateMutationOptions(options), queryClient)
}
export const getProductLinesUpdateUrl = (id: string) => {
  return `/api/product-lines/${id}`
}

export const productLinesUpdate = async (
  id: string,
  saveProductLineRequest: SaveProductLineRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductLineDto> => {
  return apiFetch<ProductLineDto>(getProductLinesUpdateUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveProductLineRequest),
  })
}

export const getProductLinesUpdateMutationKey = () => ['productLinesUpdate'] as const

export const getProductLinesUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productLinesUpdate>>,
    TError,
    ProductLinesUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productLinesUpdate>>,
  TError,
  ProductLinesUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getProductLinesUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productLinesUpdate>>,
    ProductLinesUpdateMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return productLinesUpdate(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductLinesUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof productLinesUpdate>>>
export type ProductLinesUpdateMutationBody = SaveProductLineRequest
export type ProductLinesUpdateMutationError = unknown
export type ProductLinesUpdateMutationVariables = { id: string; data: SaveProductLineRequest }

export const useProductLinesUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productLinesUpdate>>,
      TError,
      ProductLinesUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productLinesUpdate>>,
  TError,
  ProductLinesUpdateMutationVariables,
  TContext
> => {
  return useMutation(getProductLinesUpdateMutationOptions(options), queryClient)
}
