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
  DeviceDto,
  HistoryPointDto,
  LiveViewResponse,
  RepPresenceDto,
  ReviewFlagRequest,
  TrackingFlagDto,
  TrackingMonitorGetDevicesParams,
  TrackingMonitorGetFlagsParams,
  TrackingMonitorGetHistoryParams,
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

export const getTrackingMonitorGetPresenceUrl = () => {
  return `/api/tracking/monitor/presence`
}

export const trackingMonitorGetPresence = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<RepPresenceDto[]> => {
  return apiFetch<RepPresenceDto[]>(getTrackingMonitorGetPresenceUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getTrackingMonitorGetPresenceQueryKey = () => {
  return [`/api/tracking/monitor/presence`] as const
}

export const getTrackingMonitorGetPresenceQueryOptions = <
  TData = Awaited<ReturnType<typeof trackingMonitorGetPresence>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetPresence>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTrackingMonitorGetPresenceQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof trackingMonitorGetPresence>>> = ({ signal }) =>
    trackingMonitorGetPresence({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof trackingMonitorGetPresence>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type TrackingMonitorGetPresenceQueryResult = NonNullable<
  Awaited<ReturnType<typeof trackingMonitorGetPresence>>
>
export type TrackingMonitorGetPresenceQueryError = unknown

export function useTrackingMonitorGetPresence<
  TData = Awaited<ReturnType<typeof trackingMonitorGetPresence>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetPresence>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingMonitorGetPresence>>,
          TError,
          Awaited<ReturnType<typeof trackingMonitorGetPresence>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetPresence<
  TData = Awaited<ReturnType<typeof trackingMonitorGetPresence>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetPresence>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingMonitorGetPresence>>,
          TError,
          Awaited<ReturnType<typeof trackingMonitorGetPresence>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetPresence<
  TData = Awaited<ReturnType<typeof trackingMonitorGetPresence>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetPresence>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetPresence<
  TData = Awaited<ReturnType<typeof trackingMonitorGetPresence>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetPresence>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTrackingMonitorGetPresenceQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getTrackingMonitorStartLiveViewUrl = (repId: string) => {
  return `/api/tracking/monitor/live-view/${repId}`
}

export const trackingMonitorStartLiveView = async (
  repId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LiveViewResponse> => {
  return apiFetch<LiveViewResponse>(getTrackingMonitorStartLiveViewUrl(repId), {
    ...options,
    method: 'POST',
  })
}

export const getTrackingMonitorStartLiveViewMutationKey = () => ['trackingMonitorStartLiveView'] as const

export const getTrackingMonitorStartLiveViewMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingMonitorStartLiveView>>,
    TError,
    TrackingMonitorStartLiveViewMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingMonitorStartLiveView>>,
  TError,
  TrackingMonitorStartLiveViewMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingMonitorStartLiveViewMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingMonitorStartLiveView>>,
    TrackingMonitorStartLiveViewMutationVariables
  > = (props) => {
    const { repId } = props ?? {}

    return trackingMonitorStartLiveView(repId, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingMonitorStartLiveViewMutationResult = NonNullable<
  Awaited<ReturnType<typeof trackingMonitorStartLiveView>>
>

export type TrackingMonitorStartLiveViewMutationError = unknown
export type TrackingMonitorStartLiveViewMutationVariables = { repId: string }

export const useTrackingMonitorStartLiveView = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingMonitorStartLiveView>>,
      TError,
      TrackingMonitorStartLiveViewMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingMonitorStartLiveView>>,
  TError,
  TrackingMonitorStartLiveViewMutationVariables,
  TContext
> => {
  return useMutation(getTrackingMonitorStartLiveViewMutationOptions(options), queryClient)
}
export const getTrackingMonitorStopLiveViewUrl = (repId: string) => {
  return `/api/tracking/monitor/live-view/${repId}`
}

export const trackingMonitorStopLiveView = async (
  repId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getTrackingMonitorStopLiveViewUrl(repId), {
    ...options,
    method: 'DELETE',
  })
}

export const getTrackingMonitorStopLiveViewMutationKey = () => ['trackingMonitorStopLiveView'] as const

export const getTrackingMonitorStopLiveViewMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingMonitorStopLiveView>>,
    TError,
    TrackingMonitorStopLiveViewMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingMonitorStopLiveView>>,
  TError,
  TrackingMonitorStopLiveViewMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingMonitorStopLiveViewMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingMonitorStopLiveView>>,
    TrackingMonitorStopLiveViewMutationVariables
  > = (props) => {
    const { repId } = props ?? {}

    return trackingMonitorStopLiveView(repId, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingMonitorStopLiveViewMutationResult = NonNullable<
  Awaited<ReturnType<typeof trackingMonitorStopLiveView>>
>

export type TrackingMonitorStopLiveViewMutationError = unknown
export type TrackingMonitorStopLiveViewMutationVariables = { repId: string }

export const useTrackingMonitorStopLiveView = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingMonitorStopLiveView>>,
      TError,
      TrackingMonitorStopLiveViewMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingMonitorStopLiveView>>,
  TError,
  TrackingMonitorStopLiveViewMutationVariables,
  TContext
> => {
  return useMutation(getTrackingMonitorStopLiveViewMutationOptions(options), queryClient)
}
export const getTrackingMonitorGetFlagsUrl = (params?: TrackingMonitorGetFlagsParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/tracking/monitor/flags?${stringifiedParams}`
    : `/api/tracking/monitor/flags`
}

export const trackingMonitorGetFlags = async (
  params?: TrackingMonitorGetFlagsParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<TrackingFlagDto[]> => {
  return apiFetch<TrackingFlagDto[]>(getTrackingMonitorGetFlagsUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getTrackingMonitorGetFlagsQueryKey = (params?: TrackingMonitorGetFlagsParams) => {
  return [`/api/tracking/monitor/flags`, ...(params ? [params] : [])] as const
}

export const getTrackingMonitorGetFlagsQueryOptions = <
  TData = Awaited<ReturnType<typeof trackingMonitorGetFlags>>,
  TError = unknown,
>(
  params?: TrackingMonitorGetFlagsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetFlags>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTrackingMonitorGetFlagsQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof trackingMonitorGetFlags>>> = ({ signal }) =>
    trackingMonitorGetFlags(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof trackingMonitorGetFlags>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type TrackingMonitorGetFlagsQueryResult = NonNullable<
  Awaited<ReturnType<typeof trackingMonitorGetFlags>>
>
export type TrackingMonitorGetFlagsQueryError = unknown

export function useTrackingMonitorGetFlags<
  TData = Awaited<ReturnType<typeof trackingMonitorGetFlags>>,
  TError = unknown,
>(
  params: undefined | TrackingMonitorGetFlagsParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetFlags>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingMonitorGetFlags>>,
          TError,
          Awaited<ReturnType<typeof trackingMonitorGetFlags>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetFlags<
  TData = Awaited<ReturnType<typeof trackingMonitorGetFlags>>,
  TError = unknown,
>(
  params?: TrackingMonitorGetFlagsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetFlags>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingMonitorGetFlags>>,
          TError,
          Awaited<ReturnType<typeof trackingMonitorGetFlags>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetFlags<
  TData = Awaited<ReturnType<typeof trackingMonitorGetFlags>>,
  TError = unknown,
>(
  params?: TrackingMonitorGetFlagsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetFlags>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetFlags<
  TData = Awaited<ReturnType<typeof trackingMonitorGetFlags>>,
  TError = unknown,
>(
  params?: TrackingMonitorGetFlagsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetFlags>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTrackingMonitorGetFlagsQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getTrackingMonitorReviewFlagUrl = (flagId: string) => {
  return `/api/tracking/monitor/flags/${flagId}/review`
}

export const trackingMonitorReviewFlag = async (
  flagId: string,
  reviewFlagRequest: ReviewFlagRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<TrackingFlagDto> => {
  return apiFetch<TrackingFlagDto>(getTrackingMonitorReviewFlagUrl(flagId), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(reviewFlagRequest),
  })
}

export const getTrackingMonitorReviewFlagMutationKey = () => ['trackingMonitorReviewFlag'] as const

export const getTrackingMonitorReviewFlagMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingMonitorReviewFlag>>,
    TError,
    TrackingMonitorReviewFlagMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingMonitorReviewFlag>>,
  TError,
  TrackingMonitorReviewFlagMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingMonitorReviewFlagMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingMonitorReviewFlag>>,
    TrackingMonitorReviewFlagMutationVariables
  > = (props) => {
    const { flagId, data } = props ?? {}

    return trackingMonitorReviewFlag(flagId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingMonitorReviewFlagMutationResult = NonNullable<
  Awaited<ReturnType<typeof trackingMonitorReviewFlag>>
>
export type TrackingMonitorReviewFlagMutationBody = ReviewFlagRequest
export type TrackingMonitorReviewFlagMutationError = unknown
export type TrackingMonitorReviewFlagMutationVariables = { flagId: string; data: ReviewFlagRequest }

export const useTrackingMonitorReviewFlag = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingMonitorReviewFlag>>,
      TError,
      TrackingMonitorReviewFlagMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingMonitorReviewFlag>>,
  TError,
  TrackingMonitorReviewFlagMutationVariables,
  TContext
> => {
  return useMutation(getTrackingMonitorReviewFlagMutationOptions(options), queryClient)
}
export const getTrackingMonitorGetDevicesUrl = (params?: TrackingMonitorGetDevicesParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/tracking/monitor/devices?${stringifiedParams}`
    : `/api/tracking/monitor/devices`
}

export const trackingMonitorGetDevices = async (
  params?: TrackingMonitorGetDevicesParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DeviceDto[]> => {
  return apiFetch<DeviceDto[]>(getTrackingMonitorGetDevicesUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getTrackingMonitorGetDevicesQueryKey = (params?: TrackingMonitorGetDevicesParams) => {
  return [`/api/tracking/monitor/devices`, ...(params ? [params] : [])] as const
}

export const getTrackingMonitorGetDevicesQueryOptions = <
  TData = Awaited<ReturnType<typeof trackingMonitorGetDevices>>,
  TError = unknown,
>(
  params?: TrackingMonitorGetDevicesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetDevices>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTrackingMonitorGetDevicesQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof trackingMonitorGetDevices>>> = ({ signal }) =>
    trackingMonitorGetDevices(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof trackingMonitorGetDevices>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type TrackingMonitorGetDevicesQueryResult = NonNullable<
  Awaited<ReturnType<typeof trackingMonitorGetDevices>>
>
export type TrackingMonitorGetDevicesQueryError = unknown

export function useTrackingMonitorGetDevices<
  TData = Awaited<ReturnType<typeof trackingMonitorGetDevices>>,
  TError = unknown,
>(
  params: undefined | TrackingMonitorGetDevicesParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetDevices>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingMonitorGetDevices>>,
          TError,
          Awaited<ReturnType<typeof trackingMonitorGetDevices>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetDevices<
  TData = Awaited<ReturnType<typeof trackingMonitorGetDevices>>,
  TError = unknown,
>(
  params?: TrackingMonitorGetDevicesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetDevices>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingMonitorGetDevices>>,
          TError,
          Awaited<ReturnType<typeof trackingMonitorGetDevices>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetDevices<
  TData = Awaited<ReturnType<typeof trackingMonitorGetDevices>>,
  TError = unknown,
>(
  params?: TrackingMonitorGetDevicesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetDevices>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetDevices<
  TData = Awaited<ReturnType<typeof trackingMonitorGetDevices>>,
  TError = unknown,
>(
  params?: TrackingMonitorGetDevicesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetDevices>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTrackingMonitorGetDevicesQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getTrackingMonitorGetHistoryUrl = (userId: string, params?: TrackingMonitorGetHistoryParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/tracking/monitor/history/${userId}?${stringifiedParams}`
    : `/api/tracking/monitor/history/${userId}`
}

export const trackingMonitorGetHistory = async (
  userId: string,
  params?: TrackingMonitorGetHistoryParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<HistoryPointDto[]> => {
  return apiFetch<HistoryPointDto[]>(getTrackingMonitorGetHistoryUrl(userId, params), {
    ...options,
    method: 'GET',
  })
}

export const getTrackingMonitorGetHistoryQueryKey = (
  userId: string,
  params?: TrackingMonitorGetHistoryParams,
) => {
  return [`/api/tracking/monitor/history/${userId}`, ...(params ? [params] : [])] as const
}

export const getTrackingMonitorGetHistoryQueryOptions = <
  TData = Awaited<ReturnType<typeof trackingMonitorGetHistory>>,
  TError = unknown,
>(
  userId: string,
  params?: TrackingMonitorGetHistoryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetHistory>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTrackingMonitorGetHistoryQueryKey(userId, params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof trackingMonitorGetHistory>>> = ({ signal }) =>
    trackingMonitorGetHistory(userId, params, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: userId !== null && userId !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetHistory>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type TrackingMonitorGetHistoryQueryResult = NonNullable<
  Awaited<ReturnType<typeof trackingMonitorGetHistory>>
>
export type TrackingMonitorGetHistoryQueryError = unknown

export function useTrackingMonitorGetHistory<
  TData = Awaited<ReturnType<typeof trackingMonitorGetHistory>>,
  TError = unknown,
>(
  userId: string,
  params: undefined | TrackingMonitorGetHistoryParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetHistory>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingMonitorGetHistory>>,
          TError,
          Awaited<ReturnType<typeof trackingMonitorGetHistory>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetHistory<
  TData = Awaited<ReturnType<typeof trackingMonitorGetHistory>>,
  TError = unknown,
>(
  userId: string,
  params?: TrackingMonitorGetHistoryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetHistory>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingMonitorGetHistory>>,
          TError,
          Awaited<ReturnType<typeof trackingMonitorGetHistory>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetHistory<
  TData = Awaited<ReturnType<typeof trackingMonitorGetHistory>>,
  TError = unknown,
>(
  userId: string,
  params?: TrackingMonitorGetHistoryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetHistory>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingMonitorGetHistory<
  TData = Awaited<ReturnType<typeof trackingMonitorGetHistory>>,
  TError = unknown,
>(
  userId: string,
  params?: TrackingMonitorGetHistoryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingMonitorGetHistory>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTrackingMonitorGetHistoryQueryOptions(userId, params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
