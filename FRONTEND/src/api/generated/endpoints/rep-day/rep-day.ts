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
  RepTodayDto,
  SetRepAmPlacesRequest,
  SetRepDayAreaRequest,
  SetRepVisitOrderRequest,
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

export const getRepDayTodayUrl = () => {
  return `/api/rep-day/today`
}

export const repDayToday = async (options?: Parameters<typeof apiFetch>[1]): Promise<RepTodayDto> => {
  return apiFetch<RepTodayDto>(getRepDayTodayUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getRepDayTodayQueryKey = () => {
  return [`/api/rep-day/today`] as const
}

export const getRepDayTodayQueryOptions = <
  TData = Awaited<ReturnType<typeof repDayToday>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof repDayToday>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getRepDayTodayQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof repDayToday>>> = ({ signal }) =>
    repDayToday({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof repDayToday>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type RepDayTodayQueryResult = NonNullable<Awaited<ReturnType<typeof repDayToday>>>
export type RepDayTodayQueryError = unknown

export function useRepDayToday<TData = Awaited<ReturnType<typeof repDayToday>>, TError = unknown>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof repDayToday>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof repDayToday>>,
          TError,
          Awaited<ReturnType<typeof repDayToday>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRepDayToday<TData = Awaited<ReturnType<typeof repDayToday>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof repDayToday>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof repDayToday>>,
          TError,
          Awaited<ReturnType<typeof repDayToday>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRepDayToday<TData = Awaited<ReturnType<typeof repDayToday>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof repDayToday>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRepDayToday<TData = Awaited<ReturnType<typeof repDayToday>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof repDayToday>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getRepDayTodayQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getRepDaySetAreaUrl = () => {
  return `/api/rep-day/today/area`
}

export const repDaySetArea = async (
  setRepDayAreaRequest: SetRepDayAreaRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RepTodayDto> => {
  return apiFetch<RepTodayDto>(getRepDaySetAreaUrl(), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(setRepDayAreaRequest),
  })
}

export const getRepDaySetAreaMutationKey = () => ['repDaySetArea'] as const

export const getRepDaySetAreaMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof repDaySetArea>>,
    TError,
    RepDaySetAreaMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof repDaySetArea>>,
  TError,
  RepDaySetAreaMutationVariables,
  TContext
> => {
  const mutationKey = getRepDaySetAreaMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof repDaySetArea>>,
    RepDaySetAreaMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return repDaySetArea(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RepDaySetAreaMutationResult = NonNullable<Awaited<ReturnType<typeof repDaySetArea>>>
export type RepDaySetAreaMutationBody = SetRepDayAreaRequest
export type RepDaySetAreaMutationError = unknown
export type RepDaySetAreaMutationVariables = { data: SetRepDayAreaRequest }

export const useRepDaySetArea = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof repDaySetArea>>,
      TError,
      RepDaySetAreaMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof repDaySetArea>>,
  TError,
  RepDaySetAreaMutationVariables,
  TContext
> => {
  return useMutation(getRepDaySetAreaMutationOptions(options), queryClient)
}
export const getRepDaySetDoctorOrderUrl = () => {
  return `/api/rep-day/today/doctor-order`
}

export const repDaySetDoctorOrder = async (
  setRepVisitOrderRequest: SetRepVisitOrderRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RepTodayDto> => {
  return apiFetch<RepTodayDto>(getRepDaySetDoctorOrderUrl(), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(setRepVisitOrderRequest),
  })
}

export const getRepDaySetDoctorOrderMutationKey = () => ['repDaySetDoctorOrder'] as const

export const getRepDaySetDoctorOrderMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof repDaySetDoctorOrder>>,
    TError,
    RepDaySetDoctorOrderMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof repDaySetDoctorOrder>>,
  TError,
  RepDaySetDoctorOrderMutationVariables,
  TContext
> => {
  const mutationKey = getRepDaySetDoctorOrderMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof repDaySetDoctorOrder>>,
    RepDaySetDoctorOrderMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return repDaySetDoctorOrder(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RepDaySetDoctorOrderMutationResult = NonNullable<Awaited<ReturnType<typeof repDaySetDoctorOrder>>>
export type RepDaySetDoctorOrderMutationBody = SetRepVisitOrderRequest
export type RepDaySetDoctorOrderMutationError = unknown
export type RepDaySetDoctorOrderMutationVariables = { data: SetRepVisitOrderRequest }

export const useRepDaySetDoctorOrder = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof repDaySetDoctorOrder>>,
      TError,
      RepDaySetDoctorOrderMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof repDaySetDoctorOrder>>,
  TError,
  RepDaySetDoctorOrderMutationVariables,
  TContext
> => {
  return useMutation(getRepDaySetDoctorOrderMutationOptions(options), queryClient)
}
export const getRepDaySetAmPlacesUrl = () => {
  return `/api/rep-day/today/am-places`
}

export const repDaySetAmPlaces = async (
  setRepAmPlacesRequest: SetRepAmPlacesRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RepTodayDto> => {
  return apiFetch<RepTodayDto>(getRepDaySetAmPlacesUrl(), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(setRepAmPlacesRequest),
  })
}

export const getRepDaySetAmPlacesMutationKey = () => ['repDaySetAmPlaces'] as const

export const getRepDaySetAmPlacesMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof repDaySetAmPlaces>>,
    TError,
    RepDaySetAmPlacesMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof repDaySetAmPlaces>>,
  TError,
  RepDaySetAmPlacesMutationVariables,
  TContext
> => {
  const mutationKey = getRepDaySetAmPlacesMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof repDaySetAmPlaces>>,
    RepDaySetAmPlacesMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return repDaySetAmPlaces(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RepDaySetAmPlacesMutationResult = NonNullable<Awaited<ReturnType<typeof repDaySetAmPlaces>>>
export type RepDaySetAmPlacesMutationBody = SetRepAmPlacesRequest
export type RepDaySetAmPlacesMutationError = unknown
export type RepDaySetAmPlacesMutationVariables = { data: SetRepAmPlacesRequest }

export const useRepDaySetAmPlaces = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof repDaySetAmPlaces>>,
      TError,
      RepDaySetAmPlacesMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof repDaySetAmPlaces>>,
  TError,
  RepDaySetAmPlacesMutationVariables,
  TContext
> => {
  return useMutation(getRepDaySetAmPlacesMutationOptions(options), queryClient)
}
