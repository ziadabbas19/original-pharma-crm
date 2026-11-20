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
  AcknowledgeIntegrityEventRequest,
  IntegrityEventDetailDto,
  IntegrityEventDto,
  IntegritySummaryDto,
  LocationIntegrityGetSummaryParams,
  LocationIntegrityListEventsParams,
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

export const getLocationIntegrityListEventsUrl = (params?: LocationIntegrityListEventsParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/tracking/integrity/events?${stringifiedParams}`
    : `/api/tracking/integrity/events`
}

export const locationIntegrityListEvents = async (
  params?: LocationIntegrityListEventsParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<IntegrityEventDto[]> => {
  return apiFetch<IntegrityEventDto[]>(getLocationIntegrityListEventsUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getLocationIntegrityListEventsQueryKey = (params?: LocationIntegrityListEventsParams) => {
  return [`/api/tracking/integrity/events`, ...(params ? [params] : [])] as const
}

export const getLocationIntegrityListEventsQueryOptions = <
  TData = Awaited<ReturnType<typeof locationIntegrityListEvents>>,
  TError = unknown,
>(
  params?: LocationIntegrityListEventsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityListEvents>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getLocationIntegrityListEventsQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof locationIntegrityListEvents>>> = ({ signal }) =>
    locationIntegrityListEvents(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof locationIntegrityListEvents>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type LocationIntegrityListEventsQueryResult = NonNullable<
  Awaited<ReturnType<typeof locationIntegrityListEvents>>
>
export type LocationIntegrityListEventsQueryError = unknown

export function useLocationIntegrityListEvents<
  TData = Awaited<ReturnType<typeof locationIntegrityListEvents>>,
  TError = unknown,
>(
  params: undefined | LocationIntegrityListEventsParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityListEvents>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof locationIntegrityListEvents>>,
          TError,
          Awaited<ReturnType<typeof locationIntegrityListEvents>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityListEvents<
  TData = Awaited<ReturnType<typeof locationIntegrityListEvents>>,
  TError = unknown,
>(
  params?: LocationIntegrityListEventsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityListEvents>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof locationIntegrityListEvents>>,
          TError,
          Awaited<ReturnType<typeof locationIntegrityListEvents>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityListEvents<
  TData = Awaited<ReturnType<typeof locationIntegrityListEvents>>,
  TError = unknown,
>(
  params?: LocationIntegrityListEventsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityListEvents>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityListEvents<
  TData = Awaited<ReturnType<typeof locationIntegrityListEvents>>,
  TError = unknown,
>(
  params?: LocationIntegrityListEventsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityListEvents>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getLocationIntegrityListEventsQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getLocationIntegrityGetEventUrl = (eventId: string) => {
  return `/api/tracking/integrity/events/${eventId}`
}

export const locationIntegrityGetEvent = async (
  eventId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<IntegrityEventDetailDto> => {
  return apiFetch<IntegrityEventDetailDto>(getLocationIntegrityGetEventUrl(eventId), {
    ...options,
    method: 'GET',
  })
}

export const getLocationIntegrityGetEventQueryKey = (eventId: string) => {
  return [`/api/tracking/integrity/events/${eventId}`] as const
}

export const getLocationIntegrityGetEventQueryOptions = <
  TData = Awaited<ReturnType<typeof locationIntegrityGetEvent>>,
  TError = unknown,
>(
  eventId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetEvent>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getLocationIntegrityGetEventQueryKey(eventId)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof locationIntegrityGetEvent>>> = ({ signal }) =>
    locationIntegrityGetEvent(eventId, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: eventId !== null && eventId !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetEvent>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type LocationIntegrityGetEventQueryResult = NonNullable<
  Awaited<ReturnType<typeof locationIntegrityGetEvent>>
>
export type LocationIntegrityGetEventQueryError = unknown

export function useLocationIntegrityGetEvent<
  TData = Awaited<ReturnType<typeof locationIntegrityGetEvent>>,
  TError = unknown,
>(
  eventId: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetEvent>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof locationIntegrityGetEvent>>,
          TError,
          Awaited<ReturnType<typeof locationIntegrityGetEvent>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityGetEvent<
  TData = Awaited<ReturnType<typeof locationIntegrityGetEvent>>,
  TError = unknown,
>(
  eventId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetEvent>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof locationIntegrityGetEvent>>,
          TError,
          Awaited<ReturnType<typeof locationIntegrityGetEvent>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityGetEvent<
  TData = Awaited<ReturnType<typeof locationIntegrityGetEvent>>,
  TError = unknown,
>(
  eventId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetEvent>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityGetEvent<
  TData = Awaited<ReturnType<typeof locationIntegrityGetEvent>>,
  TError = unknown,
>(
  eventId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetEvent>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getLocationIntegrityGetEventQueryOptions(eventId, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getLocationIntegrityAcknowledgeEventUrl = (eventId: string) => {
  return `/api/tracking/integrity/events/${eventId}/acknowledge`
}

export const locationIntegrityAcknowledgeEvent = async (
  eventId: string,
  acknowledgeIntegrityEventRequest: AcknowledgeIntegrityEventRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<IntegrityEventDto> => {
  return apiFetch<IntegrityEventDto>(getLocationIntegrityAcknowledgeEventUrl(eventId), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(acknowledgeIntegrityEventRequest),
  })
}

export const getLocationIntegrityAcknowledgeEventMutationKey = () =>
  ['locationIntegrityAcknowledgeEvent'] as const

export const getLocationIntegrityAcknowledgeEventMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof locationIntegrityAcknowledgeEvent>>,
    TError,
    LocationIntegrityAcknowledgeEventMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof locationIntegrityAcknowledgeEvent>>,
  TError,
  LocationIntegrityAcknowledgeEventMutationVariables,
  TContext
> => {
  const mutationKey = getLocationIntegrityAcknowledgeEventMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof locationIntegrityAcknowledgeEvent>>,
    LocationIntegrityAcknowledgeEventMutationVariables
  > = (props) => {
    const { eventId, data } = props ?? {}

    return locationIntegrityAcknowledgeEvent(eventId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type LocationIntegrityAcknowledgeEventMutationResult = NonNullable<
  Awaited<ReturnType<typeof locationIntegrityAcknowledgeEvent>>
>
export type LocationIntegrityAcknowledgeEventMutationBody = AcknowledgeIntegrityEventRequest
export type LocationIntegrityAcknowledgeEventMutationError = unknown
export type LocationIntegrityAcknowledgeEventMutationVariables = {
  eventId: string
  data: AcknowledgeIntegrityEventRequest
}

export const useLocationIntegrityAcknowledgeEvent = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof locationIntegrityAcknowledgeEvent>>,
      TError,
      LocationIntegrityAcknowledgeEventMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof locationIntegrityAcknowledgeEvent>>,
  TError,
  LocationIntegrityAcknowledgeEventMutationVariables,
  TContext
> => {
  return useMutation(getLocationIntegrityAcknowledgeEventMutationOptions(options), queryClient)
}
export const getLocationIntegrityGetSummaryUrl = (params?: LocationIntegrityGetSummaryParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/tracking/integrity/summary?${stringifiedParams}`
    : `/api/tracking/integrity/summary`
}

export const locationIntegrityGetSummary = async (
  params?: LocationIntegrityGetSummaryParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<IntegritySummaryDto> => {
  return apiFetch<IntegritySummaryDto>(getLocationIntegrityGetSummaryUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getLocationIntegrityGetSummaryQueryKey = (params?: LocationIntegrityGetSummaryParams) => {
  return [`/api/tracking/integrity/summary`, ...(params ? [params] : [])] as const
}

export const getLocationIntegrityGetSummaryQueryOptions = <
  TData = Awaited<ReturnType<typeof locationIntegrityGetSummary>>,
  TError = unknown,
>(
  params?: LocationIntegrityGetSummaryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetSummary>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getLocationIntegrityGetSummaryQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof locationIntegrityGetSummary>>> = ({ signal }) =>
    locationIntegrityGetSummary(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof locationIntegrityGetSummary>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type LocationIntegrityGetSummaryQueryResult = NonNullable<
  Awaited<ReturnType<typeof locationIntegrityGetSummary>>
>
export type LocationIntegrityGetSummaryQueryError = unknown

export function useLocationIntegrityGetSummary<
  TData = Awaited<ReturnType<typeof locationIntegrityGetSummary>>,
  TError = unknown,
>(
  params: undefined | LocationIntegrityGetSummaryParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetSummary>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof locationIntegrityGetSummary>>,
          TError,
          Awaited<ReturnType<typeof locationIntegrityGetSummary>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityGetSummary<
  TData = Awaited<ReturnType<typeof locationIntegrityGetSummary>>,
  TError = unknown,
>(
  params?: LocationIntegrityGetSummaryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetSummary>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof locationIntegrityGetSummary>>,
          TError,
          Awaited<ReturnType<typeof locationIntegrityGetSummary>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityGetSummary<
  TData = Awaited<ReturnType<typeof locationIntegrityGetSummary>>,
  TError = unknown,
>(
  params?: LocationIntegrityGetSummaryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetSummary>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useLocationIntegrityGetSummary<
  TData = Awaited<ReturnType<typeof locationIntegrityGetSummary>>,
  TError = unknown,
>(
  params?: LocationIntegrityGetSummaryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof locationIntegrityGetSummary>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getLocationIntegrityGetSummaryQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
