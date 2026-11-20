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
  LocationTrustSettingsDto,
  RepHomeSettingsDto,
  UpdateLocationTrustSettingsRequest,
  UpdateRepHomeSettingsRequest,
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

export const getSettingsGetLocationTrustUrl = () => {
  return `/api/settings/location-trust`
}

export const settingsGetLocationTrust = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<LocationTrustSettingsDto> => {
  return apiFetch<LocationTrustSettingsDto>(getSettingsGetLocationTrustUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getSettingsGetLocationTrustQueryKey = () => {
  return [`/api/settings/location-trust`] as const
}

export const getSettingsGetLocationTrustQueryOptions = <
  TData = Awaited<ReturnType<typeof settingsGetLocationTrust>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof settingsGetLocationTrust>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getSettingsGetLocationTrustQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof settingsGetLocationTrust>>> = ({ signal }) =>
    settingsGetLocationTrust({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof settingsGetLocationTrust>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type SettingsGetLocationTrustQueryResult = NonNullable<
  Awaited<ReturnType<typeof settingsGetLocationTrust>>
>
export type SettingsGetLocationTrustQueryError = unknown

export function useSettingsGetLocationTrust<
  TData = Awaited<ReturnType<typeof settingsGetLocationTrust>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof settingsGetLocationTrust>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof settingsGetLocationTrust>>,
          TError,
          Awaited<ReturnType<typeof settingsGetLocationTrust>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useSettingsGetLocationTrust<
  TData = Awaited<ReturnType<typeof settingsGetLocationTrust>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof settingsGetLocationTrust>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof settingsGetLocationTrust>>,
          TError,
          Awaited<ReturnType<typeof settingsGetLocationTrust>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useSettingsGetLocationTrust<
  TData = Awaited<ReturnType<typeof settingsGetLocationTrust>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof settingsGetLocationTrust>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useSettingsGetLocationTrust<
  TData = Awaited<ReturnType<typeof settingsGetLocationTrust>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof settingsGetLocationTrust>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getSettingsGetLocationTrustQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getSettingsUpdateLocationTrustUrl = () => {
  return `/api/settings/location-trust`
}

export const settingsUpdateLocationTrust = async (
  updateLocationTrustSettingsRequest: UpdateLocationTrustSettingsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LocationTrustSettingsDto> => {
  return apiFetch<LocationTrustSettingsDto>(getSettingsUpdateLocationTrustUrl(), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateLocationTrustSettingsRequest),
  })
}

export const getSettingsUpdateLocationTrustMutationKey = () => ['settingsUpdateLocationTrust'] as const

export const getSettingsUpdateLocationTrustMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof settingsUpdateLocationTrust>>,
    TError,
    SettingsUpdateLocationTrustMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof settingsUpdateLocationTrust>>,
  TError,
  SettingsUpdateLocationTrustMutationVariables,
  TContext
> => {
  const mutationKey = getSettingsUpdateLocationTrustMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof settingsUpdateLocationTrust>>,
    SettingsUpdateLocationTrustMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return settingsUpdateLocationTrust(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type SettingsUpdateLocationTrustMutationResult = NonNullable<
  Awaited<ReturnType<typeof settingsUpdateLocationTrust>>
>
export type SettingsUpdateLocationTrustMutationBody = UpdateLocationTrustSettingsRequest
export type SettingsUpdateLocationTrustMutationError = unknown
export type SettingsUpdateLocationTrustMutationVariables = { data: UpdateLocationTrustSettingsRequest }

export const useSettingsUpdateLocationTrust = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof settingsUpdateLocationTrust>>,
      TError,
      SettingsUpdateLocationTrustMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof settingsUpdateLocationTrust>>,
  TError,
  SettingsUpdateLocationTrustMutationVariables,
  TContext
> => {
  return useMutation(getSettingsUpdateLocationTrustMutationOptions(options), queryClient)
}
export const getRepHomeSettingsGetRepHomeUrl = () => {
  return `/api/settings/rep-home`
}

export const repHomeSettingsGetRepHome = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<RepHomeSettingsDto> => {
  return apiFetch<RepHomeSettingsDto>(getRepHomeSettingsGetRepHomeUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getRepHomeSettingsGetRepHomeQueryKey = () => {
  return [`/api/settings/rep-home`] as const
}

export const getRepHomeSettingsGetRepHomeQueryOptions = <
  TData = Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getRepHomeSettingsGetRepHomeQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>> = ({ signal }) =>
    repHomeSettingsGetRepHome({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type RepHomeSettingsGetRepHomeQueryResult = NonNullable<
  Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>
>
export type RepHomeSettingsGetRepHomeQueryError = unknown

export function useRepHomeSettingsGetRepHome<
  TData = Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>,
          TError,
          Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRepHomeSettingsGetRepHome<
  TData = Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>,
          TError,
          Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRepHomeSettingsGetRepHome<
  TData = Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRepHomeSettingsGetRepHome<
  TData = Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof repHomeSettingsGetRepHome>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getRepHomeSettingsGetRepHomeQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getRepHomeSettingsUpdateRepHomeUrl = () => {
  return `/api/settings/rep-home`
}

export const repHomeSettingsUpdateRepHome = async (
  updateRepHomeSettingsRequest: UpdateRepHomeSettingsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RepHomeSettingsDto> => {
  return apiFetch<RepHomeSettingsDto>(getRepHomeSettingsUpdateRepHomeUrl(), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateRepHomeSettingsRequest),
  })
}

export const getRepHomeSettingsUpdateRepHomeMutationKey = () => ['repHomeSettingsUpdateRepHome'] as const

export const getRepHomeSettingsUpdateRepHomeMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof repHomeSettingsUpdateRepHome>>,
    TError,
    RepHomeSettingsUpdateRepHomeMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof repHomeSettingsUpdateRepHome>>,
  TError,
  RepHomeSettingsUpdateRepHomeMutationVariables,
  TContext
> => {
  const mutationKey = getRepHomeSettingsUpdateRepHomeMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof repHomeSettingsUpdateRepHome>>,
    RepHomeSettingsUpdateRepHomeMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return repHomeSettingsUpdateRepHome(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RepHomeSettingsUpdateRepHomeMutationResult = NonNullable<
  Awaited<ReturnType<typeof repHomeSettingsUpdateRepHome>>
>
export type RepHomeSettingsUpdateRepHomeMutationBody = UpdateRepHomeSettingsRequest
export type RepHomeSettingsUpdateRepHomeMutationError = unknown
export type RepHomeSettingsUpdateRepHomeMutationVariables = { data: UpdateRepHomeSettingsRequest }

export const useRepHomeSettingsUpdateRepHome = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof repHomeSettingsUpdateRepHome>>,
      TError,
      RepHomeSettingsUpdateRepHomeMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof repHomeSettingsUpdateRepHome>>,
  TError,
  RepHomeSettingsUpdateRepHomeMutationVariables,
  TContext
> => {
  return useMutation(getRepHomeSettingsUpdateRepHomeMutationOptions(options), queryClient)
}
