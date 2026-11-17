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
  CheckInRequest,
  CheckOutRequest,
  VisitDto,
  VisitListItemDto,
  VisitPhotoDto,
  VisitsListParams,
  VisitsUploadPhotoBody,
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

export const getVisitsListUrl = (params?: VisitsListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/visits?${stringifiedParams}` : `/api/visits`
}

export const visitsList = async (
  params?: VisitsListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<VisitListItemDto[]> => {
  return apiFetch<VisitListItemDto[]>(getVisitsListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getVisitsListQueryKey = (params?: VisitsListParams) => {
  return [`/api/visits`, ...(params ? [params] : [])] as const
}

export const getVisitsListQueryOptions = <TData = Awaited<ReturnType<typeof visitsList>>, TError = unknown>(
  params?: VisitsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getVisitsListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof visitsList>>> = ({ signal }) =>
    visitsList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof visitsList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type VisitsListQueryResult = NonNullable<Awaited<ReturnType<typeof visitsList>>>
export type VisitsListQueryError = unknown

export function useVisitsList<TData = Awaited<ReturnType<typeof visitsList>>, TError = unknown>(
  params: undefined | VisitsListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof visitsList>>,
          TError,
          Awaited<ReturnType<typeof visitsList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useVisitsList<TData = Awaited<ReturnType<typeof visitsList>>, TError = unknown>(
  params?: VisitsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof visitsList>>,
          TError,
          Awaited<ReturnType<typeof visitsList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useVisitsList<TData = Awaited<ReturnType<typeof visitsList>>, TError = unknown>(
  params?: VisitsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useVisitsList<TData = Awaited<ReturnType<typeof visitsList>>, TError = unknown>(
  params?: VisitsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getVisitsListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getVisitsCheckInUrl = () => {
  return `/api/visits/check-in`
}

export const visitsCheckIn = async (
  checkInRequest: CheckInRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<VisitDto> => {
  return apiFetch<VisitDto>(getVisitsCheckInUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(checkInRequest),
  })
}

export const getVisitsCheckInMutationKey = () => ['visitsCheckIn'] as const

export const getVisitsCheckInMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof visitsCheckIn>>,
    TError,
    VisitsCheckInMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof visitsCheckIn>>,
  TError,
  VisitsCheckInMutationVariables,
  TContext
> => {
  const mutationKey = getVisitsCheckInMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof visitsCheckIn>>,
    VisitsCheckInMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return visitsCheckIn(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type VisitsCheckInMutationResult = NonNullable<Awaited<ReturnType<typeof visitsCheckIn>>>
export type VisitsCheckInMutationBody = CheckInRequest
export type VisitsCheckInMutationError = unknown
export type VisitsCheckInMutationVariables = { data: CheckInRequest }

export const useVisitsCheckIn = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof visitsCheckIn>>,
      TError,
      VisitsCheckInMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof visitsCheckIn>>,
  TError,
  VisitsCheckInMutationVariables,
  TContext
> => {
  return useMutation(getVisitsCheckInMutationOptions(options), queryClient)
}
export const getVisitsCheckOutUrl = (visitId: string) => {
  return `/api/visits/${visitId}/check-out`
}

export const visitsCheckOut = async (
  visitId: string,
  checkOutRequest: CheckOutRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<VisitDto> => {
  return apiFetch<VisitDto>(getVisitsCheckOutUrl(visitId), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(checkOutRequest),
  })
}

export const getVisitsCheckOutMutationKey = () => ['visitsCheckOut'] as const

export const getVisitsCheckOutMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof visitsCheckOut>>,
    TError,
    VisitsCheckOutMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof visitsCheckOut>>,
  TError,
  VisitsCheckOutMutationVariables,
  TContext
> => {
  const mutationKey = getVisitsCheckOutMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof visitsCheckOut>>,
    VisitsCheckOutMutationVariables
  > = (props) => {
    const { visitId, data } = props ?? {}

    return visitsCheckOut(visitId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type VisitsCheckOutMutationResult = NonNullable<Awaited<ReturnType<typeof visitsCheckOut>>>
export type VisitsCheckOutMutationBody = CheckOutRequest
export type VisitsCheckOutMutationError = unknown
export type VisitsCheckOutMutationVariables = { visitId: string; data: CheckOutRequest }

export const useVisitsCheckOut = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof visitsCheckOut>>,
      TError,
      VisitsCheckOutMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof visitsCheckOut>>,
  TError,
  VisitsCheckOutMutationVariables,
  TContext
> => {
  return useMutation(getVisitsCheckOutMutationOptions(options), queryClient)
}
export const getVisitsUploadPhotoUrl = (visitId: string) => {
  return `/api/visits/${visitId}/photos`
}

export const visitsUploadPhoto = async (
  visitId: string,
  visitsUploadPhotoBody: VisitsUploadPhotoBody,
  options?: Parameters<typeof apiFetch>[1],
): Promise<VisitPhotoDto> => {
  const formData = new FormData()
  if (visitsUploadPhotoBody.photo !== undefined) {
    formData.append(`photo`, visitsUploadPhotoBody.photo)
  }

  return apiFetch<VisitPhotoDto>(getVisitsUploadPhotoUrl(visitId), {
    ...options,
    method: 'POST',
    body: formData,
  })
}

export const getVisitsUploadPhotoMutationKey = () => ['visitsUploadPhoto'] as const

export const getVisitsUploadPhotoMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof visitsUploadPhoto>>,
    TError,
    VisitsUploadPhotoMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof visitsUploadPhoto>>,
  TError,
  VisitsUploadPhotoMutationVariables,
  TContext
> => {
  const mutationKey = getVisitsUploadPhotoMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof visitsUploadPhoto>>,
    VisitsUploadPhotoMutationVariables
  > = (props) => {
    const { visitId, data } = props ?? {}

    return visitsUploadPhoto(visitId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type VisitsUploadPhotoMutationResult = NonNullable<Awaited<ReturnType<typeof visitsUploadPhoto>>>
export type VisitsUploadPhotoMutationBody = VisitsUploadPhotoBody
export type VisitsUploadPhotoMutationError = unknown
export type VisitsUploadPhotoMutationVariables = { visitId: string; data: VisitsUploadPhotoBody }

export const useVisitsUploadPhoto = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof visitsUploadPhoto>>,
      TError,
      VisitsUploadPhotoMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof visitsUploadPhoto>>,
  TError,
  VisitsUploadPhotoMutationVariables,
  TContext
> => {
  return useMutation(getVisitsUploadPhotoMutationOptions(options), queryClient)
}
export const getVisitsGetUrl = (visitId: string) => {
  return `/api/visits/${visitId}`
}

export const visitsGet = async (
  visitId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<VisitDto> => {
  return apiFetch<VisitDto>(getVisitsGetUrl(visitId), {
    ...options,
    method: 'GET',
  })
}

export const getVisitsGetQueryKey = (visitId: string) => {
  return [`/api/visits/${visitId}`] as const
}

export const getVisitsGetQueryOptions = <TData = Awaited<ReturnType<typeof visitsGet>>, TError = unknown>(
  visitId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getVisitsGetQueryKey(visitId)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof visitsGet>>> = ({ signal }) =>
    visitsGet(visitId, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: visitId !== null && visitId !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof visitsGet>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type VisitsGetQueryResult = NonNullable<Awaited<ReturnType<typeof visitsGet>>>
export type VisitsGetQueryError = unknown

export function useVisitsGet<TData = Awaited<ReturnType<typeof visitsGet>>, TError = unknown>(
  visitId: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsGet>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof visitsGet>>,
          TError,
          Awaited<ReturnType<typeof visitsGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useVisitsGet<TData = Awaited<ReturnType<typeof visitsGet>>, TError = unknown>(
  visitId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsGet>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof visitsGet>>,
          TError,
          Awaited<ReturnType<typeof visitsGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useVisitsGet<TData = Awaited<ReturnType<typeof visitsGet>>, TError = unknown>(
  visitId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useVisitsGet<TData = Awaited<ReturnType<typeof visitsGet>>, TError = unknown>(
  visitId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof visitsGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getVisitsGetQueryOptions(visitId, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
