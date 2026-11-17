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
  ConsentStatusDto,
  CurrentShiftResponse,
  DeviceHealthReportRequest,
  DeviceHealthResult,
  EndShiftRequest,
  LocationBatchRequest,
  LocationBatchResult,
  RecordConsentRequest,
  ShiftDto,
  StartShiftRequest,
  StartShiftResponse,
  TestPointRequest,
  TestPointResult,
  TrackingConfigDto,
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

export const getTrackingPostLocationsUrl = () => {
  return `/api/tracking/locations`
}

export const trackingPostLocations = async (
  locationBatchRequest: LocationBatchRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<LocationBatchResult> => {
  return apiFetch<LocationBatchResult>(getTrackingPostLocationsUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(locationBatchRequest),
  })
}

export const getTrackingPostLocationsMutationKey = () => ['trackingPostLocations'] as const

export const getTrackingPostLocationsMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingPostLocations>>,
    TError,
    TrackingPostLocationsMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingPostLocations>>,
  TError,
  TrackingPostLocationsMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingPostLocationsMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingPostLocations>>,
    TrackingPostLocationsMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return trackingPostLocations(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingPostLocationsMutationResult = NonNullable<
  Awaited<ReturnType<typeof trackingPostLocations>>
>
export type TrackingPostLocationsMutationBody = LocationBatchRequest
export type TrackingPostLocationsMutationError = unknown
export type TrackingPostLocationsMutationVariables = { data: LocationBatchRequest }

export const useTrackingPostLocations = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingPostLocations>>,
      TError,
      TrackingPostLocationsMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingPostLocations>>,
  TError,
  TrackingPostLocationsMutationVariables,
  TContext
> => {
  return useMutation(getTrackingPostLocationsMutationOptions(options), queryClient)
}
export const getTrackingPostTestPointUrl = () => {
  return `/api/tracking/test-point`
}

export const trackingPostTestPoint = async (
  testPointRequest: TestPointRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<TestPointResult> => {
  return apiFetch<TestPointResult>(getTrackingPostTestPointUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(testPointRequest),
  })
}

export const getTrackingPostTestPointMutationKey = () => ['trackingPostTestPoint'] as const

export const getTrackingPostTestPointMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingPostTestPoint>>,
    TError,
    TrackingPostTestPointMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingPostTestPoint>>,
  TError,
  TrackingPostTestPointMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingPostTestPointMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingPostTestPoint>>,
    TrackingPostTestPointMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return trackingPostTestPoint(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingPostTestPointMutationResult = NonNullable<
  Awaited<ReturnType<typeof trackingPostTestPoint>>
>
export type TrackingPostTestPointMutationBody = TestPointRequest
export type TrackingPostTestPointMutationError = unknown
export type TrackingPostTestPointMutationVariables = { data: TestPointRequest }

export const useTrackingPostTestPoint = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingPostTestPoint>>,
      TError,
      TrackingPostTestPointMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingPostTestPoint>>,
  TError,
  TrackingPostTestPointMutationVariables,
  TContext
> => {
  return useMutation(getTrackingPostTestPointMutationOptions(options), queryClient)
}
export const getTrackingGetConfigUrl = () => {
  return `/api/tracking/config`
}

export const trackingGetConfig = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<TrackingConfigDto> => {
  return apiFetch<TrackingConfigDto>(getTrackingGetConfigUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getTrackingGetConfigQueryKey = () => {
  return [`/api/tracking/config`] as const
}

export const getTrackingGetConfigQueryOptions = <
  TData = Awaited<ReturnType<typeof trackingGetConfig>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConfig>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTrackingGetConfigQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof trackingGetConfig>>> = ({ signal }) =>
    trackingGetConfig({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof trackingGetConfig>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type TrackingGetConfigQueryResult = NonNullable<Awaited<ReturnType<typeof trackingGetConfig>>>
export type TrackingGetConfigQueryError = unknown

export function useTrackingGetConfig<TData = Awaited<ReturnType<typeof trackingGetConfig>>, TError = unknown>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConfig>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingGetConfig>>,
          TError,
          Awaited<ReturnType<typeof trackingGetConfig>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetConfig<TData = Awaited<ReturnType<typeof trackingGetConfig>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConfig>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingGetConfig>>,
          TError,
          Awaited<ReturnType<typeof trackingGetConfig>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetConfig<TData = Awaited<ReturnType<typeof trackingGetConfig>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConfig>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetConfig<TData = Awaited<ReturnType<typeof trackingGetConfig>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConfig>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTrackingGetConfigQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getTrackingGetCurrentShiftUrl = () => {
  return `/api/tracking/shifts/current`
}

export const trackingGetCurrentShift = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<CurrentShiftResponse> => {
  return apiFetch<CurrentShiftResponse>(getTrackingGetCurrentShiftUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getTrackingGetCurrentShiftQueryKey = () => {
  return [`/api/tracking/shifts/current`] as const
}

export const getTrackingGetCurrentShiftQueryOptions = <
  TData = Awaited<ReturnType<typeof trackingGetCurrentShift>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetCurrentShift>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTrackingGetCurrentShiftQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof trackingGetCurrentShift>>> = ({ signal }) =>
    trackingGetCurrentShift({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof trackingGetCurrentShift>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type TrackingGetCurrentShiftQueryResult = NonNullable<
  Awaited<ReturnType<typeof trackingGetCurrentShift>>
>
export type TrackingGetCurrentShiftQueryError = unknown

export function useTrackingGetCurrentShift<
  TData = Awaited<ReturnType<typeof trackingGetCurrentShift>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetCurrentShift>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingGetCurrentShift>>,
          TError,
          Awaited<ReturnType<typeof trackingGetCurrentShift>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetCurrentShift<
  TData = Awaited<ReturnType<typeof trackingGetCurrentShift>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetCurrentShift>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingGetCurrentShift>>,
          TError,
          Awaited<ReturnType<typeof trackingGetCurrentShift>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetCurrentShift<
  TData = Awaited<ReturnType<typeof trackingGetCurrentShift>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetCurrentShift>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetCurrentShift<
  TData = Awaited<ReturnType<typeof trackingGetCurrentShift>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetCurrentShift>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTrackingGetCurrentShiftQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getTrackingStartShiftUrl = () => {
  return `/api/tracking/shifts/start`
}

export const trackingStartShift = async (
  startShiftRequest: StartShiftRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<StartShiftResponse> => {
  return apiFetch<StartShiftResponse>(getTrackingStartShiftUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(startShiftRequest),
  })
}

export const getTrackingStartShiftMutationKey = () => ['trackingStartShift'] as const

export const getTrackingStartShiftMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingStartShift>>,
    TError,
    TrackingStartShiftMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingStartShift>>,
  TError,
  TrackingStartShiftMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingStartShiftMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingStartShift>>,
    TrackingStartShiftMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return trackingStartShift(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingStartShiftMutationResult = NonNullable<Awaited<ReturnType<typeof trackingStartShift>>>
export type TrackingStartShiftMutationBody = StartShiftRequest
export type TrackingStartShiftMutationError = unknown
export type TrackingStartShiftMutationVariables = { data: StartShiftRequest }

export const useTrackingStartShift = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingStartShift>>,
      TError,
      TrackingStartShiftMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingStartShift>>,
  TError,
  TrackingStartShiftMutationVariables,
  TContext
> => {
  return useMutation(getTrackingStartShiftMutationOptions(options), queryClient)
}
export const getTrackingEndShiftUrl = () => {
  return `/api/tracking/shifts/end`
}

export const trackingEndShift = async (
  endShiftRequest: EndShiftRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ShiftDto> => {
  return apiFetch<ShiftDto>(getTrackingEndShiftUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(endShiftRequest),
  })
}

export const getTrackingEndShiftMutationKey = () => ['trackingEndShift'] as const

export const getTrackingEndShiftMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingEndShift>>,
    TError,
    TrackingEndShiftMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingEndShift>>,
  TError,
  TrackingEndShiftMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingEndShiftMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingEndShift>>,
    TrackingEndShiftMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return trackingEndShift(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingEndShiftMutationResult = NonNullable<Awaited<ReturnType<typeof trackingEndShift>>>
export type TrackingEndShiftMutationBody = EndShiftRequest
export type TrackingEndShiftMutationError = unknown
export type TrackingEndShiftMutationVariables = { data: EndShiftRequest }

export const useTrackingEndShift = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingEndShift>>,
      TError,
      TrackingEndShiftMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingEndShift>>,
  TError,
  TrackingEndShiftMutationVariables,
  TContext
> => {
  return useMutation(getTrackingEndShiftMutationOptions(options), queryClient)
}
export const getTrackingReportDeviceHealthUrl = () => {
  return `/api/tracking/device-health`
}

export const trackingReportDeviceHealth = async (
  deviceHealthReportRequest: DeviceHealthReportRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DeviceHealthResult> => {
  return apiFetch<DeviceHealthResult>(getTrackingReportDeviceHealthUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(deviceHealthReportRequest),
  })
}

export const getTrackingReportDeviceHealthMutationKey = () => ['trackingReportDeviceHealth'] as const

export const getTrackingReportDeviceHealthMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingReportDeviceHealth>>,
    TError,
    TrackingReportDeviceHealthMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingReportDeviceHealth>>,
  TError,
  TrackingReportDeviceHealthMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingReportDeviceHealthMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingReportDeviceHealth>>,
    TrackingReportDeviceHealthMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return trackingReportDeviceHealth(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingReportDeviceHealthMutationResult = NonNullable<
  Awaited<ReturnType<typeof trackingReportDeviceHealth>>
>
export type TrackingReportDeviceHealthMutationBody = DeviceHealthReportRequest
export type TrackingReportDeviceHealthMutationError = unknown
export type TrackingReportDeviceHealthMutationVariables = { data: DeviceHealthReportRequest }

export const useTrackingReportDeviceHealth = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingReportDeviceHealth>>,
      TError,
      TrackingReportDeviceHealthMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingReportDeviceHealth>>,
  TError,
  TrackingReportDeviceHealthMutationVariables,
  TContext
> => {
  return useMutation(getTrackingReportDeviceHealthMutationOptions(options), queryClient)
}
export const getTrackingGetConsentUrl = () => {
  return `/api/tracking/consent`
}

export const trackingGetConsent = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<ConsentStatusDto> => {
  return apiFetch<ConsentStatusDto>(getTrackingGetConsentUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getTrackingGetConsentQueryKey = () => {
  return [`/api/tracking/consent`] as const
}

export const getTrackingGetConsentQueryOptions = <
  TData = Awaited<ReturnType<typeof trackingGetConsent>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConsent>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getTrackingGetConsentQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof trackingGetConsent>>> = ({ signal }) =>
    trackingGetConsent({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof trackingGetConsent>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type TrackingGetConsentQueryResult = NonNullable<Awaited<ReturnType<typeof trackingGetConsent>>>
export type TrackingGetConsentQueryError = unknown

export function useTrackingGetConsent<
  TData = Awaited<ReturnType<typeof trackingGetConsent>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConsent>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingGetConsent>>,
          TError,
          Awaited<ReturnType<typeof trackingGetConsent>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetConsent<
  TData = Awaited<ReturnType<typeof trackingGetConsent>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConsent>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof trackingGetConsent>>,
          TError,
          Awaited<ReturnType<typeof trackingGetConsent>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetConsent<
  TData = Awaited<ReturnType<typeof trackingGetConsent>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConsent>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useTrackingGetConsent<
  TData = Awaited<ReturnType<typeof trackingGetConsent>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof trackingGetConsent>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getTrackingGetConsentQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getTrackingRecordConsentUrl = () => {
  return `/api/tracking/consent`
}

export const trackingRecordConsent = async (
  recordConsentRequest: RecordConsentRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ConsentStatusDto> => {
  return apiFetch<ConsentStatusDto>(getTrackingRecordConsentUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(recordConsentRequest),
  })
}

export const getTrackingRecordConsentMutationKey = () => ['trackingRecordConsent'] as const

export const getTrackingRecordConsentMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof trackingRecordConsent>>,
    TError,
    TrackingRecordConsentMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof trackingRecordConsent>>,
  TError,
  TrackingRecordConsentMutationVariables,
  TContext
> => {
  const mutationKey = getTrackingRecordConsentMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof trackingRecordConsent>>,
    TrackingRecordConsentMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return trackingRecordConsent(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type TrackingRecordConsentMutationResult = NonNullable<
  Awaited<ReturnType<typeof trackingRecordConsent>>
>
export type TrackingRecordConsentMutationBody = RecordConsentRequest
export type TrackingRecordConsentMutationError = unknown
export type TrackingRecordConsentMutationVariables = { data: RecordConsentRequest }

export const useTrackingRecordConsent = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof trackingRecordConsent>>,
      TError,
      TrackingRecordConsentMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof trackingRecordConsent>>,
  TError,
  TrackingRecordConsentMutationVariables,
  TContext
> => {
  return useMutation(getTrackingRecordConsentMutationOptions(options), queryClient)
}
