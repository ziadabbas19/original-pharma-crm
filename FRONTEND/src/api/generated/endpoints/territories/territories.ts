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
  CreateTerritoryRequest,
  ProblemDetails,
  TerritoriesListParams,
  TerritoryDto,
  UpdateTerritoryRequest,
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

export const getTerritoriesListUrl = (params?: TerritoriesListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/territories?${stringifiedParams}` : `/api/territories`
}

export const territoriesList = async (
  params?: TerritoriesListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<TerritoryDto[]> => {
  return apiFetch<TerritoryDto[]>(getTerritoriesListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getTerritoriesListQueryKey = (params?: TerritoriesListParams) => {
  return [`/api/territories`, ...(params ? [params] : [])] as const
}

export const getTerritoriesListQueryOptions = <
  TData = Awaited<ReturnType<typeof territoriesList>>,
  TError = unknown,
>(
  params?: TerritoriesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof territoriesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTerritoriesListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof territoriesList>>> = ({ signal }) =>
    territoriesList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof territoriesList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type TerritoriesListQueryResult = NonNullable<Awaited<ReturnType<typeof territoriesList>>>
export type TerritoriesListQueryError = unknown

export function useTerritoriesList<TData = Awaited<ReturnType<typeof territoriesList>>, TError = unknown>(
  params: undefined | TerritoriesListParams,
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
  params?: TerritoriesListParams,
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
  params?: TerritoriesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof territoriesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTerritoriesList<TData = Awaited<ReturnType<typeof territoriesList>>, TError = unknown>(
  params?: TerritoriesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof territoriesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTerritoriesListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getTerritoriesCreateUrl = () => {
  return `/api/territories`
}

export const territoriesCreate = async (
  createTerritoryRequest: CreateTerritoryRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<TerritoryDto> => {
  return apiFetch<TerritoryDto>(getTerritoriesCreateUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createTerritoryRequest),
  })
}

export const getTerritoriesCreateMutationKey = () => ['territoriesCreate'] as const

export const getTerritoriesCreateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof territoriesCreate>>,
    TError,
    TerritoriesCreateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof territoriesCreate>>,
  TError,
  TerritoriesCreateMutationVariables,
  TContext
> => {
  const mutationKey = getTerritoriesCreateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof territoriesCreate>>,
    TerritoriesCreateMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return territoriesCreate(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TerritoriesCreateMutationResult = NonNullable<Awaited<ReturnType<typeof territoriesCreate>>>
export type TerritoriesCreateMutationBody = CreateTerritoryRequest
export type TerritoriesCreateMutationError = unknown
export type TerritoriesCreateMutationVariables = { data: CreateTerritoryRequest }

export const useTerritoriesCreate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof territoriesCreate>>,
      TError,
      TerritoriesCreateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof territoriesCreate>>,
  TError,
  TerritoriesCreateMutationVariables,
  TContext
> => {
  return useMutation(getTerritoriesCreateMutationOptions(options), queryClient)
}
export const getTerritoriesBulkDeleteUrl = () => {
  return `/api/territories/bulk-delete`
}

export const territoriesBulkDelete = async (
  bulkDeleteRequest: BulkDeleteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getTerritoriesBulkDeleteUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkDeleteRequest),
  })
}

export const getTerritoriesBulkDeleteMutationKey = () => ['territoriesBulkDelete'] as const

export const getTerritoriesBulkDeleteMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof territoriesBulkDelete>>,
    TError,
    TerritoriesBulkDeleteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof territoriesBulkDelete>>,
  TError,
  TerritoriesBulkDeleteMutationVariables,
  TContext
> => {
  const mutationKey = getTerritoriesBulkDeleteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof territoriesBulkDelete>>,
    TerritoriesBulkDeleteMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return territoriesBulkDelete(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TerritoriesBulkDeleteMutationResult = NonNullable<
  Awaited<ReturnType<typeof territoriesBulkDelete>>
>
export type TerritoriesBulkDeleteMutationBody = BulkDeleteRequest
export type TerritoriesBulkDeleteMutationError = unknown
export type TerritoriesBulkDeleteMutationVariables = { data: BulkDeleteRequest }

export const useTerritoriesBulkDelete = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof territoriesBulkDelete>>,
      TError,
      TerritoriesBulkDeleteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof territoriesBulkDelete>>,
  TError,
  TerritoriesBulkDeleteMutationVariables,
  TContext
> => {
  return useMutation(getTerritoriesBulkDeleteMutationOptions(options), queryClient)
}
export const getTerritoriesBulkRestoreUrl = () => {
  return `/api/territories/bulk-restore`
}

export const territoriesBulkRestore = async (
  bulkIdsRequest: BulkIdsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getTerritoriesBulkRestoreUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkIdsRequest),
  })
}

export const getTerritoriesBulkRestoreMutationKey = () => ['territoriesBulkRestore'] as const

export const getTerritoriesBulkRestoreMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof territoriesBulkRestore>>,
    TError,
    TerritoriesBulkRestoreMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof territoriesBulkRestore>>,
  TError,
  TerritoriesBulkRestoreMutationVariables,
  TContext
> => {
  const mutationKey = getTerritoriesBulkRestoreMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof territoriesBulkRestore>>,
    TerritoriesBulkRestoreMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return territoriesBulkRestore(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TerritoriesBulkRestoreMutationResult = NonNullable<
  Awaited<ReturnType<typeof territoriesBulkRestore>>
>
export type TerritoriesBulkRestoreMutationBody = BulkIdsRequest
export type TerritoriesBulkRestoreMutationError = unknown
export type TerritoriesBulkRestoreMutationVariables = { data: BulkIdsRequest }

export const useTerritoriesBulkRestore = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof territoriesBulkRestore>>,
      TError,
      TerritoriesBulkRestoreMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof territoriesBulkRestore>>,
  TError,
  TerritoriesBulkRestoreMutationVariables,
  TContext
> => {
  return useMutation(getTerritoriesBulkRestoreMutationOptions(options), queryClient)
}
export const getTerritoriesUpdateUrl = (id: string) => {
  return `/api/territories/${id}`
}

export const territoriesUpdate = async (
  id: string,
  updateTerritoryRequest: UpdateTerritoryRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<TerritoryDto> => {
  return apiFetch<TerritoryDto>(getTerritoriesUpdateUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateTerritoryRequest),
  })
}

export const getTerritoriesUpdateMutationKey = () => ['territoriesUpdate'] as const

export const getTerritoriesUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof territoriesUpdate>>,
    TError,
    TerritoriesUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof territoriesUpdate>>,
  TError,
  TerritoriesUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getTerritoriesUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof territoriesUpdate>>,
    TerritoriesUpdateMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return territoriesUpdate(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TerritoriesUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof territoriesUpdate>>>
export type TerritoriesUpdateMutationBody = UpdateTerritoryRequest
export type TerritoriesUpdateMutationError = unknown
export type TerritoriesUpdateMutationVariables = { id: string; data: UpdateTerritoryRequest }

export const useTerritoriesUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof territoriesUpdate>>,
      TError,
      TerritoriesUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof territoriesUpdate>>,
  TError,
  TerritoriesUpdateMutationVariables,
  TContext
> => {
  return useMutation(getTerritoriesUpdateMutationOptions(options), queryClient)
}
export const getTerritoriesDeleteUrl = (id: string) => {
  return `/api/territories/${id}`
}

export const territoriesDelete = async (
  id: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getTerritoriesDeleteUrl(id), {
    ...options,
    method: 'DELETE',
  })
}

export const getTerritoriesDeleteMutationKey = () => ['territoriesDelete'] as const

export const getTerritoriesDeleteMutationOptions = <TError = ProblemDetails, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof territoriesDelete>>,
    TError,
    TerritoriesDeleteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof territoriesDelete>>,
  TError,
  TerritoriesDeleteMutationVariables,
  TContext
> => {
  const mutationKey = getTerritoriesDeleteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof territoriesDelete>>,
    TerritoriesDeleteMutationVariables
  > = (props) => {
    const { id } = props ?? {}

    return territoriesDelete(id, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TerritoriesDeleteMutationResult = NonNullable<Awaited<ReturnType<typeof territoriesDelete>>>

export type TerritoriesDeleteMutationError = ProblemDetails
export type TerritoriesDeleteMutationVariables = { id: string }

export const useTerritoriesDelete = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof territoriesDelete>>,
      TError,
      TerritoriesDeleteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof territoriesDelete>>,
  TError,
  TerritoriesDeleteMutationVariables,
  TContext
> => {
  return useMutation(getTerritoriesDeleteMutationOptions(options), queryClient)
}
