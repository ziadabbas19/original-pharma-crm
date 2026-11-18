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

import type {
  CatalogStatsDto,
  DoctorStatsDto,
  OrderStatsDto,
  RepStatsDto,
  StatsCatalogParams,
  StatsDoctorsParams,
  StatsExportParams,
  StatsOrdersParams,
  StatsRepsParams,
  StatsVisitsParams,
  Stream,
  VisitStatsDto,
} from '../../model'

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

export const getStatsOrdersUrl = (params?: StatsOrdersParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/stats/orders?${stringifiedParams}` : `/api/stats/orders`
}

export const statsOrders = async (
  params?: StatsOrdersParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<OrderStatsDto> => {
  return apiFetch<OrderStatsDto>(getStatsOrdersUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getStatsOrdersQueryKey = (params?: StatsOrdersParams) => {
  return [`/api/stats/orders`, ...(params ? [params] : [])] as const
}

export const getStatsOrdersQueryOptions = <TData = Awaited<ReturnType<typeof statsOrders>>, TError = unknown>(
  params?: StatsOrdersParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsOrders>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getStatsOrdersQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof statsOrders>>> = ({ signal }) =>
    statsOrders(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof statsOrders>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type StatsOrdersQueryResult = NonNullable<Awaited<ReturnType<typeof statsOrders>>>
export type StatsOrdersQueryError = unknown

export function useStatsOrders<TData = Awaited<ReturnType<typeof statsOrders>>, TError = unknown>(
  params: undefined | StatsOrdersParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsOrders>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsOrders>>,
          TError,
          Awaited<ReturnType<typeof statsOrders>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsOrders<TData = Awaited<ReturnType<typeof statsOrders>>, TError = unknown>(
  params?: StatsOrdersParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsOrders>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsOrders>>,
          TError,
          Awaited<ReturnType<typeof statsOrders>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsOrders<TData = Awaited<ReturnType<typeof statsOrders>>, TError = unknown>(
  params?: StatsOrdersParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsOrders>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsOrders<TData = Awaited<ReturnType<typeof statsOrders>>, TError = unknown>(
  params?: StatsOrdersParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsOrders>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getStatsOrdersQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getStatsVisitsUrl = (params?: StatsVisitsParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/stats/visits?${stringifiedParams}` : `/api/stats/visits`
}

export const statsVisits = async (
  params?: StatsVisitsParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<VisitStatsDto> => {
  return apiFetch<VisitStatsDto>(getStatsVisitsUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getStatsVisitsQueryKey = (params?: StatsVisitsParams) => {
  return [`/api/stats/visits`, ...(params ? [params] : [])] as const
}

export const getStatsVisitsQueryOptions = <TData = Awaited<ReturnType<typeof statsVisits>>, TError = unknown>(
  params?: StatsVisitsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsVisits>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getStatsVisitsQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof statsVisits>>> = ({ signal }) =>
    statsVisits(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof statsVisits>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type StatsVisitsQueryResult = NonNullable<Awaited<ReturnType<typeof statsVisits>>>
export type StatsVisitsQueryError = unknown

export function useStatsVisits<TData = Awaited<ReturnType<typeof statsVisits>>, TError = unknown>(
  params: undefined | StatsVisitsParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsVisits>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsVisits>>,
          TError,
          Awaited<ReturnType<typeof statsVisits>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsVisits<TData = Awaited<ReturnType<typeof statsVisits>>, TError = unknown>(
  params?: StatsVisitsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsVisits>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsVisits>>,
          TError,
          Awaited<ReturnType<typeof statsVisits>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsVisits<TData = Awaited<ReturnType<typeof statsVisits>>, TError = unknown>(
  params?: StatsVisitsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsVisits>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsVisits<TData = Awaited<ReturnType<typeof statsVisits>>, TError = unknown>(
  params?: StatsVisitsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsVisits>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getStatsVisitsQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getStatsDoctorsUrl = (params?: StatsDoctorsParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/stats/doctors?${stringifiedParams}` : `/api/stats/doctors`
}

export const statsDoctors = async (
  params?: StatsDoctorsParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DoctorStatsDto> => {
  return apiFetch<DoctorStatsDto>(getStatsDoctorsUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getStatsDoctorsQueryKey = (params?: StatsDoctorsParams) => {
  return [`/api/stats/doctors`, ...(params ? [params] : [])] as const
}

export const getStatsDoctorsQueryOptions = <
  TData = Awaited<ReturnType<typeof statsDoctors>>,
  TError = unknown,
>(
  params?: StatsDoctorsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsDoctors>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getStatsDoctorsQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof statsDoctors>>> = ({ signal }) =>
    statsDoctors(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof statsDoctors>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type StatsDoctorsQueryResult = NonNullable<Awaited<ReturnType<typeof statsDoctors>>>
export type StatsDoctorsQueryError = unknown

export function useStatsDoctors<TData = Awaited<ReturnType<typeof statsDoctors>>, TError = unknown>(
  params: undefined | StatsDoctorsParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsDoctors>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsDoctors>>,
          TError,
          Awaited<ReturnType<typeof statsDoctors>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsDoctors<TData = Awaited<ReturnType<typeof statsDoctors>>, TError = unknown>(
  params?: StatsDoctorsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsDoctors>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsDoctors>>,
          TError,
          Awaited<ReturnType<typeof statsDoctors>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsDoctors<TData = Awaited<ReturnType<typeof statsDoctors>>, TError = unknown>(
  params?: StatsDoctorsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsDoctors>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsDoctors<TData = Awaited<ReturnType<typeof statsDoctors>>, TError = unknown>(
  params?: StatsDoctorsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsDoctors>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getStatsDoctorsQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getStatsRepsUrl = (params?: StatsRepsParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/stats/reps?${stringifiedParams}` : `/api/stats/reps`
}

export const statsReps = async (
  params?: StatsRepsParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RepStatsDto> => {
  return apiFetch<RepStatsDto>(getStatsRepsUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getStatsRepsQueryKey = (params?: StatsRepsParams) => {
  return [`/api/stats/reps`, ...(params ? [params] : [])] as const
}

export const getStatsRepsQueryOptions = <TData = Awaited<ReturnType<typeof statsReps>>, TError = unknown>(
  params?: StatsRepsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsReps>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getStatsRepsQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof statsReps>>> = ({ signal }) =>
    statsReps(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof statsReps>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type StatsRepsQueryResult = NonNullable<Awaited<ReturnType<typeof statsReps>>>
export type StatsRepsQueryError = unknown

export function useStatsReps<TData = Awaited<ReturnType<typeof statsReps>>, TError = unknown>(
  params: undefined | StatsRepsParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsReps>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsReps>>,
          TError,
          Awaited<ReturnType<typeof statsReps>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsReps<TData = Awaited<ReturnType<typeof statsReps>>, TError = unknown>(
  params?: StatsRepsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsReps>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsReps>>,
          TError,
          Awaited<ReturnType<typeof statsReps>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsReps<TData = Awaited<ReturnType<typeof statsReps>>, TError = unknown>(
  params?: StatsRepsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsReps>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsReps<TData = Awaited<ReturnType<typeof statsReps>>, TError = unknown>(
  params?: StatsRepsParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsReps>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getStatsRepsQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getStatsCatalogUrl = (params?: StatsCatalogParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/stats/catalog?${stringifiedParams}` : `/api/stats/catalog`
}

export const statsCatalog = async (
  params?: StatsCatalogParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<CatalogStatsDto> => {
  return apiFetch<CatalogStatsDto>(getStatsCatalogUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getStatsCatalogQueryKey = (params?: StatsCatalogParams) => {
  return [`/api/stats/catalog`, ...(params ? [params] : [])] as const
}

export const getStatsCatalogQueryOptions = <
  TData = Awaited<ReturnType<typeof statsCatalog>>,
  TError = unknown,
>(
  params?: StatsCatalogParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsCatalog>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getStatsCatalogQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof statsCatalog>>> = ({ signal }) =>
    statsCatalog(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof statsCatalog>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type StatsCatalogQueryResult = NonNullable<Awaited<ReturnType<typeof statsCatalog>>>
export type StatsCatalogQueryError = unknown

export function useStatsCatalog<TData = Awaited<ReturnType<typeof statsCatalog>>, TError = unknown>(
  params: undefined | StatsCatalogParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsCatalog>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsCatalog>>,
          TError,
          Awaited<ReturnType<typeof statsCatalog>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsCatalog<TData = Awaited<ReturnType<typeof statsCatalog>>, TError = unknown>(
  params?: StatsCatalogParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsCatalog>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsCatalog>>,
          TError,
          Awaited<ReturnType<typeof statsCatalog>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsCatalog<TData = Awaited<ReturnType<typeof statsCatalog>>, TError = unknown>(
  params?: StatsCatalogParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsCatalog>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsCatalog<TData = Awaited<ReturnType<typeof statsCatalog>>, TError = unknown>(
  params?: StatsCatalogParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsCatalog>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getStatsCatalogQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getStatsExportUrl = (params?: StatsExportParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/stats/export?${stringifiedParams}` : `/api/stats/export`
}

export const statsExport = async (
  params?: StatsExportParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<Stream> => {
  return apiFetch<Stream>(getStatsExportUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getStatsExportQueryKey = (params?: StatsExportParams) => {
  return [`/api/stats/export`, ...(params ? [params] : [])] as const
}

export const getStatsExportQueryOptions = <TData = Awaited<ReturnType<typeof statsExport>>, TError = unknown>(
  params?: StatsExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getStatsExportQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof statsExport>>> = ({ signal }) =>
    statsExport(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof statsExport>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type StatsExportQueryResult = NonNullable<Awaited<ReturnType<typeof statsExport>>>
export type StatsExportQueryError = unknown

export function useStatsExport<TData = Awaited<ReturnType<typeof statsExport>>, TError = unknown>(
  params: undefined | StatsExportParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsExport>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsExport>>,
          TError,
          Awaited<ReturnType<typeof statsExport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsExport<TData = Awaited<ReturnType<typeof statsExport>>, TError = unknown>(
  params?: StatsExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsExport>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof statsExport>>,
          TError,
          Awaited<ReturnType<typeof statsExport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsExport<TData = Awaited<ReturnType<typeof statsExport>>, TError = unknown>(
  params?: StatsExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useStatsExport<TData = Awaited<ReturnType<typeof statsExport>>, TError = unknown>(
  params?: StatsExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof statsExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getStatsExportQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
