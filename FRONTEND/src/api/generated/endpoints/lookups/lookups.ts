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

import type {
  BulkDeleteRequest,
  BulkIdsRequest,
  BulkResult,
  LookupDto,
  LookupsListCollectionMethodsParams,
  LookupsListSpecialtiesParams,
  SaveLookupRequest,
  TownDto,
} from '../../model'

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

export const getLookupsListTownsUrl = () => {
  return `/api/lookups/towns`
}

export const lookupsListTowns = async (options?: Parameters<typeof apiFetch>[1]): Promise<TownDto[]> => {
  return apiFetch<TownDto[]>(getLookupsListTownsUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getLookupsListTownsQueryKey = () => {
  return [`/api/lookups/towns`] as const
}

export const getLookupsListTownsQueryOptions = <
  TData = Awaited<ReturnType<typeof lookupsListTowns>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListTowns>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getLookupsListTownsQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof lookupsListTowns>>> = ({ signal }) =>
    lookupsListTowns({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof lookupsListTowns>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type LookupsListTownsQueryResult = NonNullable<Awaited<ReturnType<typeof lookupsListTowns>>>
export type LookupsListTownsQueryError = unknown

export function useLookupsListTowns<TData = Awaited<ReturnType<typeof lookupsListTowns>>, TError = unknown>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListTowns>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof lookupsListTowns>>,
          TError,
          Awaited<ReturnType<typeof lookupsListTowns>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListTowns<TData = Awaited<ReturnType<typeof lookupsListTowns>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListTowns>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof lookupsListTowns>>,
          TError,
          Awaited<ReturnType<typeof lookupsListTowns>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListTowns<TData = Awaited<ReturnType<typeof lookupsListTowns>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListTowns>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListTowns<TData = Awaited<ReturnType<typeof lookupsListTowns>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListTowns>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getLookupsListTownsQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getLookupsListSpecialtiesUrl = (params?: LookupsListSpecialtiesParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/lookups/specialties?${stringifiedParams}`
    : `/api/lookups/specialties`
}

export const lookupsListSpecialties = async (
  params?: LookupsListSpecialtiesParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LookupDto[]> => {
  return apiFetch<LookupDto[]>(getLookupsListSpecialtiesUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getLookupsListSpecialtiesQueryKey = (params?: LookupsListSpecialtiesParams) => {
  return [`/api/lookups/specialties`, ...(params ? [params] : [])] as const
}

export const getLookupsListSpecialtiesQueryOptions = <
  TData = Awaited<ReturnType<typeof lookupsListSpecialties>>,
  TError = unknown,
>(
  params?: LookupsListSpecialtiesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListSpecialties>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getLookupsListSpecialtiesQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof lookupsListSpecialties>>> = ({ signal }) =>
    lookupsListSpecialties(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof lookupsListSpecialties>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type LookupsListSpecialtiesQueryResult = NonNullable<
  Awaited<ReturnType<typeof lookupsListSpecialties>>
>
export type LookupsListSpecialtiesQueryError = unknown

export function useLookupsListSpecialties<
  TData = Awaited<ReturnType<typeof lookupsListSpecialties>>,
  TError = unknown,
>(
  params: undefined | LookupsListSpecialtiesParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListSpecialties>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof lookupsListSpecialties>>,
          TError,
          Awaited<ReturnType<typeof lookupsListSpecialties>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListSpecialties<
  TData = Awaited<ReturnType<typeof lookupsListSpecialties>>,
  TError = unknown,
>(
  params?: LookupsListSpecialtiesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListSpecialties>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof lookupsListSpecialties>>,
          TError,
          Awaited<ReturnType<typeof lookupsListSpecialties>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListSpecialties<
  TData = Awaited<ReturnType<typeof lookupsListSpecialties>>,
  TError = unknown,
>(
  params?: LookupsListSpecialtiesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListSpecialties>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListSpecialties<
  TData = Awaited<ReturnType<typeof lookupsListSpecialties>>,
  TError = unknown,
>(
  params?: LookupsListSpecialtiesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListSpecialties>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getLookupsListSpecialtiesQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getLookupsCreateSpecialtyUrl = () => {
  return `/api/lookups/specialties`
}

export const lookupsCreateSpecialty = async (
  saveLookupRequest: SaveLookupRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LookupDto> => {
  return apiFetch<LookupDto>(getLookupsCreateSpecialtyUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveLookupRequest),
  })
}

export const getLookupsCreateSpecialtyMutationKey = () => ['lookupsCreateSpecialty'] as const

export const getLookupsCreateSpecialtyMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof lookupsCreateSpecialty>>,
    TError,
    LookupsCreateSpecialtyMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof lookupsCreateSpecialty>>,
  TError,
  LookupsCreateSpecialtyMutationVariables,
  TContext
> => {
  const mutationKey = getLookupsCreateSpecialtyMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof lookupsCreateSpecialty>>,
    LookupsCreateSpecialtyMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return lookupsCreateSpecialty(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LookupsCreateSpecialtyMutationResult = NonNullable<
  Awaited<ReturnType<typeof lookupsCreateSpecialty>>
>
export type LookupsCreateSpecialtyMutationBody = SaveLookupRequest
export type LookupsCreateSpecialtyMutationError = unknown
export type LookupsCreateSpecialtyMutationVariables = { data: SaveLookupRequest }

export const useLookupsCreateSpecialty = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof lookupsCreateSpecialty>>,
      TError,
      LookupsCreateSpecialtyMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof lookupsCreateSpecialty>>,
  TError,
  LookupsCreateSpecialtyMutationVariables,
  TContext
> => {
  return useMutation(getLookupsCreateSpecialtyMutationOptions(options), queryClient)
}
export const getLookupsUpdateSpecialtyUrl = (id: string) => {
  return `/api/lookups/specialties/${id}`
}

export const lookupsUpdateSpecialty = async (
  id: string,
  saveLookupRequest: SaveLookupRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LookupDto> => {
  return apiFetch<LookupDto>(getLookupsUpdateSpecialtyUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveLookupRequest),
  })
}

export const getLookupsUpdateSpecialtyMutationKey = () => ['lookupsUpdateSpecialty'] as const

export const getLookupsUpdateSpecialtyMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof lookupsUpdateSpecialty>>,
    TError,
    LookupsUpdateSpecialtyMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof lookupsUpdateSpecialty>>,
  TError,
  LookupsUpdateSpecialtyMutationVariables,
  TContext
> => {
  const mutationKey = getLookupsUpdateSpecialtyMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof lookupsUpdateSpecialty>>,
    LookupsUpdateSpecialtyMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return lookupsUpdateSpecialty(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LookupsUpdateSpecialtyMutationResult = NonNullable<
  Awaited<ReturnType<typeof lookupsUpdateSpecialty>>
>
export type LookupsUpdateSpecialtyMutationBody = SaveLookupRequest
export type LookupsUpdateSpecialtyMutationError = unknown
export type LookupsUpdateSpecialtyMutationVariables = { id: string; data: SaveLookupRequest }

export const useLookupsUpdateSpecialty = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof lookupsUpdateSpecialty>>,
      TError,
      LookupsUpdateSpecialtyMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof lookupsUpdateSpecialty>>,
  TError,
  LookupsUpdateSpecialtyMutationVariables,
  TContext
> => {
  return useMutation(getLookupsUpdateSpecialtyMutationOptions(options), queryClient)
}
export const getLookupsDeleteSpecialtiesUrl = () => {
  return `/api/lookups/specialties/bulk-delete`
}

export const lookupsDeleteSpecialties = async (
  bulkDeleteRequest: BulkDeleteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getLookupsDeleteSpecialtiesUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkDeleteRequest),
  })
}

export const getLookupsDeleteSpecialtiesMutationKey = () => ['lookupsDeleteSpecialties'] as const

export const getLookupsDeleteSpecialtiesMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof lookupsDeleteSpecialties>>,
    TError,
    LookupsDeleteSpecialtiesMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof lookupsDeleteSpecialties>>,
  TError,
  LookupsDeleteSpecialtiesMutationVariables,
  TContext
> => {
  const mutationKey = getLookupsDeleteSpecialtiesMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof lookupsDeleteSpecialties>>,
    LookupsDeleteSpecialtiesMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return lookupsDeleteSpecialties(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LookupsDeleteSpecialtiesMutationResult = NonNullable<
  Awaited<ReturnType<typeof lookupsDeleteSpecialties>>
>
export type LookupsDeleteSpecialtiesMutationBody = BulkDeleteRequest
export type LookupsDeleteSpecialtiesMutationError = unknown
export type LookupsDeleteSpecialtiesMutationVariables = { data: BulkDeleteRequest }

export const useLookupsDeleteSpecialties = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof lookupsDeleteSpecialties>>,
      TError,
      LookupsDeleteSpecialtiesMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof lookupsDeleteSpecialties>>,
  TError,
  LookupsDeleteSpecialtiesMutationVariables,
  TContext
> => {
  return useMutation(getLookupsDeleteSpecialtiesMutationOptions(options), queryClient)
}
export const getLookupsRestoreSpecialtiesUrl = () => {
  return `/api/lookups/specialties/bulk-restore`
}

export const lookupsRestoreSpecialties = async (
  bulkIdsRequest: BulkIdsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getLookupsRestoreSpecialtiesUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkIdsRequest),
  })
}

export const getLookupsRestoreSpecialtiesMutationKey = () => ['lookupsRestoreSpecialties'] as const

export const getLookupsRestoreSpecialtiesMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof lookupsRestoreSpecialties>>,
    TError,
    LookupsRestoreSpecialtiesMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof lookupsRestoreSpecialties>>,
  TError,
  LookupsRestoreSpecialtiesMutationVariables,
  TContext
> => {
  const mutationKey = getLookupsRestoreSpecialtiesMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof lookupsRestoreSpecialties>>,
    LookupsRestoreSpecialtiesMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return lookupsRestoreSpecialties(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LookupsRestoreSpecialtiesMutationResult = NonNullable<
  Awaited<ReturnType<typeof lookupsRestoreSpecialties>>
>
export type LookupsRestoreSpecialtiesMutationBody = BulkIdsRequest
export type LookupsRestoreSpecialtiesMutationError = unknown
export type LookupsRestoreSpecialtiesMutationVariables = { data: BulkIdsRequest }

export const useLookupsRestoreSpecialties = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof lookupsRestoreSpecialties>>,
      TError,
      LookupsRestoreSpecialtiesMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof lookupsRestoreSpecialties>>,
  TError,
  LookupsRestoreSpecialtiesMutationVariables,
  TContext
> => {
  return useMutation(getLookupsRestoreSpecialtiesMutationOptions(options), queryClient)
}
export const getLookupsListCollectionMethodsUrl = (params?: LookupsListCollectionMethodsParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/lookups/collection-methods?${stringifiedParams}`
    : `/api/lookups/collection-methods`
}

export const lookupsListCollectionMethods = async (
  params?: LookupsListCollectionMethodsParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LookupDto[]> => {
  return apiFetch<LookupDto[]>(getLookupsListCollectionMethodsUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getLookupsListCollectionMethodsQueryKey = (params?: LookupsListCollectionMethodsParams) => {
  return [`/api/lookups/collection-methods`, ...(params ? [params] : [])] as const
}

export const getLookupsListCollectionMethodsQueryOptions = <
  TData = Awaited<ReturnType<typeof lookupsListCollectionMethods>>,
  TError = unknown,
>(
  params?: LookupsListCollectionMethodsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListCollectionMethods>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getLookupsListCollectionMethodsQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof lookupsListCollectionMethods>>> = ({ signal }) =>
    lookupsListCollectionMethods(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof lookupsListCollectionMethods>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type LookupsListCollectionMethodsQueryResult = NonNullable<
  Awaited<ReturnType<typeof lookupsListCollectionMethods>>
>
export type LookupsListCollectionMethodsQueryError = unknown

export function useLookupsListCollectionMethods<
  TData = Awaited<ReturnType<typeof lookupsListCollectionMethods>>,
  TError = unknown,
>(
  params: undefined | LookupsListCollectionMethodsParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListCollectionMethods>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof lookupsListCollectionMethods>>,
          TError,
          Awaited<ReturnType<typeof lookupsListCollectionMethods>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListCollectionMethods<
  TData = Awaited<ReturnType<typeof lookupsListCollectionMethods>>,
  TError = unknown,
>(
  params?: LookupsListCollectionMethodsParams,
  options?: {
    query?: Partial<
      UseQueryOptions<Awaited<ReturnType<typeof lookupsListCollectionMethods>>, TError, TData>
    > &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof lookupsListCollectionMethods>>,
          TError,
          Awaited<ReturnType<typeof lookupsListCollectionMethods>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListCollectionMethods<
  TData = Awaited<ReturnType<typeof lookupsListCollectionMethods>>,
  TError = unknown,
>(
  params?: LookupsListCollectionMethodsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListCollectionMethods>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLookupsListCollectionMethods<
  TData = Awaited<ReturnType<typeof lookupsListCollectionMethods>>,
  TError = unknown,
>(
  params?: LookupsListCollectionMethodsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof lookupsListCollectionMethods>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getLookupsListCollectionMethodsQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getLookupsCreateCollectionMethodUrl = () => {
  return `/api/lookups/collection-methods`
}

export const lookupsCreateCollectionMethod = async (
  saveLookupRequest: SaveLookupRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LookupDto> => {
  return apiFetch<LookupDto>(getLookupsCreateCollectionMethodUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveLookupRequest),
  })
}

export const getLookupsCreateCollectionMethodMutationKey = () => ['lookupsCreateCollectionMethod'] as const

export const getLookupsCreateCollectionMethodMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof lookupsCreateCollectionMethod>>,
    TError,
    LookupsCreateCollectionMethodMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof lookupsCreateCollectionMethod>>,
  TError,
  LookupsCreateCollectionMethodMutationVariables,
  TContext
> => {
  const mutationKey = getLookupsCreateCollectionMethodMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof lookupsCreateCollectionMethod>>,
    LookupsCreateCollectionMethodMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return lookupsCreateCollectionMethod(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LookupsCreateCollectionMethodMutationResult = NonNullable<
  Awaited<ReturnType<typeof lookupsCreateCollectionMethod>>
>
export type LookupsCreateCollectionMethodMutationBody = SaveLookupRequest
export type LookupsCreateCollectionMethodMutationError = unknown
export type LookupsCreateCollectionMethodMutationVariables = { data: SaveLookupRequest }

export const useLookupsCreateCollectionMethod = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof lookupsCreateCollectionMethod>>,
      TError,
      LookupsCreateCollectionMethodMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof lookupsCreateCollectionMethod>>,
  TError,
  LookupsCreateCollectionMethodMutationVariables,
  TContext
> => {
  return useMutation(getLookupsCreateCollectionMethodMutationOptions(options), queryClient)
}
export const getLookupsDeleteCollectionMethodsUrl = () => {
  return `/api/lookups/collection-methods/bulk-delete`
}

export const lookupsDeleteCollectionMethods = async (
  bulkDeleteRequest: BulkDeleteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getLookupsDeleteCollectionMethodsUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkDeleteRequest),
  })
}

export const getLookupsDeleteCollectionMethodsMutationKey = () => ['lookupsDeleteCollectionMethods'] as const

export const getLookupsDeleteCollectionMethodsMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof lookupsDeleteCollectionMethods>>,
    TError,
    LookupsDeleteCollectionMethodsMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof lookupsDeleteCollectionMethods>>,
  TError,
  LookupsDeleteCollectionMethodsMutationVariables,
  TContext
> => {
  const mutationKey = getLookupsDeleteCollectionMethodsMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof lookupsDeleteCollectionMethods>>,
    LookupsDeleteCollectionMethodsMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return lookupsDeleteCollectionMethods(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LookupsDeleteCollectionMethodsMutationResult = NonNullable<
  Awaited<ReturnType<typeof lookupsDeleteCollectionMethods>>
>
export type LookupsDeleteCollectionMethodsMutationBody = BulkDeleteRequest
export type LookupsDeleteCollectionMethodsMutationError = unknown
export type LookupsDeleteCollectionMethodsMutationVariables = { data: BulkDeleteRequest }

export const useLookupsDeleteCollectionMethods = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof lookupsDeleteCollectionMethods>>,
      TError,
      LookupsDeleteCollectionMethodsMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof lookupsDeleteCollectionMethods>>,
  TError,
  LookupsDeleteCollectionMethodsMutationVariables,
  TContext
> => {
  return useMutation(getLookupsDeleteCollectionMethodsMutationOptions(options), queryClient)
}
export const getLookupsRestoreCollectionMethodsUrl = () => {
  return `/api/lookups/collection-methods/bulk-restore`
}

export const lookupsRestoreCollectionMethods = async (
  bulkIdsRequest: BulkIdsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getLookupsRestoreCollectionMethodsUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkIdsRequest),
  })
}

export const getLookupsRestoreCollectionMethodsMutationKey = () =>
  ['lookupsRestoreCollectionMethods'] as const

export const getLookupsRestoreCollectionMethodsMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof lookupsRestoreCollectionMethods>>,
    TError,
    LookupsRestoreCollectionMethodsMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof lookupsRestoreCollectionMethods>>,
  TError,
  LookupsRestoreCollectionMethodsMutationVariables,
  TContext
> => {
  const mutationKey = getLookupsRestoreCollectionMethodsMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof lookupsRestoreCollectionMethods>>,
    LookupsRestoreCollectionMethodsMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return lookupsRestoreCollectionMethods(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LookupsRestoreCollectionMethodsMutationResult = NonNullable<
  Awaited<ReturnType<typeof lookupsRestoreCollectionMethods>>
>
export type LookupsRestoreCollectionMethodsMutationBody = BulkIdsRequest
export type LookupsRestoreCollectionMethodsMutationError = unknown
export type LookupsRestoreCollectionMethodsMutationVariables = { data: BulkIdsRequest }

export const useLookupsRestoreCollectionMethods = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof lookupsRestoreCollectionMethods>>,
      TError,
      LookupsRestoreCollectionMethodsMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof lookupsRestoreCollectionMethods>>,
  TError,
  LookupsRestoreCollectionMethodsMutationVariables,
  TContext
> => {
  return useMutation(getLookupsRestoreCollectionMethodsMutationOptions(options), queryClient)
}
export const getLookupsUpdateCollectionMethodUrl = (id: string) => {
  return `/api/lookups/collection-methods/${id}`
}

export const lookupsUpdateCollectionMethod = async (
  id: string,
  saveLookupRequest: SaveLookupRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LookupDto> => {
  return apiFetch<LookupDto>(getLookupsUpdateCollectionMethodUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveLookupRequest),
  })
}

export const getLookupsUpdateCollectionMethodMutationKey = () => ['lookupsUpdateCollectionMethod'] as const

export const getLookupsUpdateCollectionMethodMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof lookupsUpdateCollectionMethod>>,
    TError,
    LookupsUpdateCollectionMethodMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof lookupsUpdateCollectionMethod>>,
  TError,
  LookupsUpdateCollectionMethodMutationVariables,
  TContext
> => {
  const mutationKey = getLookupsUpdateCollectionMethodMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof lookupsUpdateCollectionMethod>>,
    LookupsUpdateCollectionMethodMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return lookupsUpdateCollectionMethod(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LookupsUpdateCollectionMethodMutationResult = NonNullable<
  Awaited<ReturnType<typeof lookupsUpdateCollectionMethod>>
>
export type LookupsUpdateCollectionMethodMutationBody = SaveLookupRequest
export type LookupsUpdateCollectionMethodMutationError = unknown
export type LookupsUpdateCollectionMethodMutationVariables = { id: string; data: SaveLookupRequest }

export const useLookupsUpdateCollectionMethod = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof lookupsUpdateCollectionMethod>>,
      TError,
      LookupsUpdateCollectionMethodMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof lookupsUpdateCollectionMethod>>,
  TError,
  LookupsUpdateCollectionMethodMutationVariables,
  TContext
> => {
  return useMutation(getLookupsUpdateCollectionMethodMutationOptions(options), queryClient)
}
