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
  AssignDoctorsRequest,
  AssignDoctorsResult,
  BulkIdsRequest,
  BulkResult,
  CreateDoctorRequest,
  DoctorDto,
  DoctorsListParams,
  DoctorsSearchDirectoryParams,
  UpdateDoctorRequest,
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

export const getDoctorsListUrl = (params?: DoctorsListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/doctors?${stringifiedParams}` : `/api/doctors`
}

export const doctorsList = async (
  params?: DoctorsListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DoctorDto[]> => {
  return apiFetch<DoctorDto[]>(getDoctorsListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getDoctorsListQueryKey = (params?: DoctorsListParams) => {
  return [`/api/doctors`, ...(params ? [params] : [])] as const
}

export const getDoctorsListQueryOptions = <TData = Awaited<ReturnType<typeof doctorsList>>, TError = unknown>(
  params?: DoctorsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getDoctorsListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof doctorsList>>> = ({ signal }) =>
    doctorsList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof doctorsList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type DoctorsListQueryResult = NonNullable<Awaited<ReturnType<typeof doctorsList>>>
export type DoctorsListQueryError = unknown

export function useDoctorsList<TData = Awaited<ReturnType<typeof doctorsList>>, TError = unknown>(
  params: undefined | DoctorsListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof doctorsList>>,
          TError,
          Awaited<ReturnType<typeof doctorsList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsList<TData = Awaited<ReturnType<typeof doctorsList>>, TError = unknown>(
  params?: DoctorsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof doctorsList>>,
          TError,
          Awaited<ReturnType<typeof doctorsList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsList<TData = Awaited<ReturnType<typeof doctorsList>>, TError = unknown>(
  params?: DoctorsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsList<TData = Awaited<ReturnType<typeof doctorsList>>, TError = unknown>(
  params?: DoctorsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getDoctorsListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getDoctorsCreateUrl = () => {
  return `/api/doctors`
}

export const doctorsCreate = async (
  createDoctorRequest: CreateDoctorRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DoctorDto> => {
  return apiFetch<DoctorDto>(getDoctorsCreateUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createDoctorRequest),
  })
}

export const getDoctorsCreateMutationKey = () => ['doctorsCreate'] as const

export const getDoctorsCreateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof doctorsCreate>>,
    TError,
    DoctorsCreateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof doctorsCreate>>,
  TError,
  DoctorsCreateMutationVariables,
  TContext
> => {
  const mutationKey = getDoctorsCreateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof doctorsCreate>>,
    DoctorsCreateMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return doctorsCreate(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type DoctorsCreateMutationResult = NonNullable<Awaited<ReturnType<typeof doctorsCreate>>>
export type DoctorsCreateMutationBody = CreateDoctorRequest
export type DoctorsCreateMutationError = unknown
export type DoctorsCreateMutationVariables = { data: CreateDoctorRequest }

export const useDoctorsCreate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof doctorsCreate>>,
      TError,
      DoctorsCreateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof doctorsCreate>>,
  TError,
  DoctorsCreateMutationVariables,
  TContext
> => {
  return useMutation(getDoctorsCreateMutationOptions(options), queryClient)
}
export const getDoctorsGetUrl = (id: string) => {
  return `/api/doctors/${id}`
}

export const doctorsGet = async (
  id: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DoctorDto> => {
  return apiFetch<DoctorDto>(getDoctorsGetUrl(id), {
    ...options,
    method: 'GET',
  })
}

export const getDoctorsGetQueryKey = (id: string) => {
  return [`/api/doctors/${id}`] as const
}

export const getDoctorsGetQueryOptions = <TData = Awaited<ReturnType<typeof doctorsGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getDoctorsGetQueryKey(id)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof doctorsGet>>> = ({ signal }) =>
    doctorsGet(id, { signal, ...requestOptions })

  return { queryKey, queryFn, enabled: id !== null && id !== undefined, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof doctorsGet>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type DoctorsGetQueryResult = NonNullable<Awaited<ReturnType<typeof doctorsGet>>>
export type DoctorsGetQueryError = unknown

export function useDoctorsGet<TData = Awaited<ReturnType<typeof doctorsGet>>, TError = unknown>(
  id: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsGet>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof doctorsGet>>,
          TError,
          Awaited<ReturnType<typeof doctorsGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsGet<TData = Awaited<ReturnType<typeof doctorsGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsGet>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof doctorsGet>>,
          TError,
          Awaited<ReturnType<typeof doctorsGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsGet<TData = Awaited<ReturnType<typeof doctorsGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsGet<TData = Awaited<ReturnType<typeof doctorsGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getDoctorsGetQueryOptions(id, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getDoctorsUpdateUrl = (id: string) => {
  return `/api/doctors/${id}`
}

export const doctorsUpdate = async (
  id: string,
  updateDoctorRequest: UpdateDoctorRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DoctorDto> => {
  return apiFetch<DoctorDto>(getDoctorsUpdateUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateDoctorRequest),
  })
}

export const getDoctorsUpdateMutationKey = () => ['doctorsUpdate'] as const

export const getDoctorsUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof doctorsUpdate>>,
    TError,
    DoctorsUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof doctorsUpdate>>,
  TError,
  DoctorsUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getDoctorsUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof doctorsUpdate>>,
    DoctorsUpdateMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return doctorsUpdate(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type DoctorsUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof doctorsUpdate>>>
export type DoctorsUpdateMutationBody = UpdateDoctorRequest
export type DoctorsUpdateMutationError = unknown
export type DoctorsUpdateMutationVariables = { id: string; data: UpdateDoctorRequest }

export const useDoctorsUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof doctorsUpdate>>,
      TError,
      DoctorsUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof doctorsUpdate>>,
  TError,
  DoctorsUpdateMutationVariables,
  TContext
> => {
  return useMutation(getDoctorsUpdateMutationOptions(options), queryClient)
}
export const getDoctorsSearchDirectoryUrl = (params?: DoctorsSearchDirectoryParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/doctors/directory?${stringifiedParams}`
    : `/api/doctors/directory`
}

export const doctorsSearchDirectory = async (
  params?: DoctorsSearchDirectoryParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DoctorDto[]> => {
  return apiFetch<DoctorDto[]>(getDoctorsSearchDirectoryUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getDoctorsSearchDirectoryQueryKey = (params?: DoctorsSearchDirectoryParams) => {
  return [`/api/doctors/directory`, ...(params ? [params] : [])] as const
}

export const getDoctorsSearchDirectoryQueryOptions = <
  TData = Awaited<ReturnType<typeof doctorsSearchDirectory>>,
  TError = unknown,
>(
  params?: DoctorsSearchDirectoryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsSearchDirectory>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getDoctorsSearchDirectoryQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof doctorsSearchDirectory>>> = ({ signal }) =>
    doctorsSearchDirectory(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof doctorsSearchDirectory>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type DoctorsSearchDirectoryQueryResult = NonNullable<
  Awaited<ReturnType<typeof doctorsSearchDirectory>>
>
export type DoctorsSearchDirectoryQueryError = unknown

export function useDoctorsSearchDirectory<
  TData = Awaited<ReturnType<typeof doctorsSearchDirectory>>,
  TError = unknown,
>(
  params: undefined | DoctorsSearchDirectoryParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsSearchDirectory>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof doctorsSearchDirectory>>,
          TError,
          Awaited<ReturnType<typeof doctorsSearchDirectory>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsSearchDirectory<
  TData = Awaited<ReturnType<typeof doctorsSearchDirectory>>,
  TError = unknown,
>(
  params?: DoctorsSearchDirectoryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsSearchDirectory>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof doctorsSearchDirectory>>,
          TError,
          Awaited<ReturnType<typeof doctorsSearchDirectory>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsSearchDirectory<
  TData = Awaited<ReturnType<typeof doctorsSearchDirectory>>,
  TError = unknown,
>(
  params?: DoctorsSearchDirectoryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsSearchDirectory>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useDoctorsSearchDirectory<
  TData = Awaited<ReturnType<typeof doctorsSearchDirectory>>,
  TError = unknown,
>(
  params?: DoctorsSearchDirectoryParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof doctorsSearchDirectory>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getDoctorsSearchDirectoryQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getDoctorsAddToMyListUrl = (id: string) => {
  return `/api/doctors/${id}/my-list`
}

export const doctorsAddToMyList = async (
  id: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<DoctorDto> => {
  return apiFetch<DoctorDto>(getDoctorsAddToMyListUrl(id), {
    ...options,
    method: 'POST',
  })
}

export const getDoctorsAddToMyListMutationKey = () => ['doctorsAddToMyList'] as const

export const getDoctorsAddToMyListMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof doctorsAddToMyList>>,
    TError,
    DoctorsAddToMyListMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof doctorsAddToMyList>>,
  TError,
  DoctorsAddToMyListMutationVariables,
  TContext
> => {
  const mutationKey = getDoctorsAddToMyListMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof doctorsAddToMyList>>,
    DoctorsAddToMyListMutationVariables
  > = (props) => {
    const { id } = props ?? {}

    return doctorsAddToMyList(id, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type DoctorsAddToMyListMutationResult = NonNullable<Awaited<ReturnType<typeof doctorsAddToMyList>>>

export type DoctorsAddToMyListMutationError = unknown
export type DoctorsAddToMyListMutationVariables = { id: string }

export const useDoctorsAddToMyList = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof doctorsAddToMyList>>,
      TError,
      DoctorsAddToMyListMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof doctorsAddToMyList>>,
  TError,
  DoctorsAddToMyListMutationVariables,
  TContext
> => {
  return useMutation(getDoctorsAddToMyListMutationOptions(options), queryClient)
}
export const getDoctorsRemoveFromMyListUrl = (id: string) => {
  return `/api/doctors/${id}/my-list`
}

export const doctorsRemoveFromMyList = async (
  id: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getDoctorsRemoveFromMyListUrl(id), {
    ...options,
    method: 'DELETE',
  })
}

export const getDoctorsRemoveFromMyListMutationKey = () => ['doctorsRemoveFromMyList'] as const

export const getDoctorsRemoveFromMyListMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof doctorsRemoveFromMyList>>,
    TError,
    DoctorsRemoveFromMyListMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof doctorsRemoveFromMyList>>,
  TError,
  DoctorsRemoveFromMyListMutationVariables,
  TContext
> => {
  const mutationKey = getDoctorsRemoveFromMyListMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof doctorsRemoveFromMyList>>,
    DoctorsRemoveFromMyListMutationVariables
  > = (props) => {
    const { id } = props ?? {}

    return doctorsRemoveFromMyList(id, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type DoctorsRemoveFromMyListMutationResult = NonNullable<
  Awaited<ReturnType<typeof doctorsRemoveFromMyList>>
>

export type DoctorsRemoveFromMyListMutationError = unknown
export type DoctorsRemoveFromMyListMutationVariables = { id: string }

export const useDoctorsRemoveFromMyList = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof doctorsRemoveFromMyList>>,
      TError,
      DoctorsRemoveFromMyListMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof doctorsRemoveFromMyList>>,
  TError,
  DoctorsRemoveFromMyListMutationVariables,
  TContext
> => {
  return useMutation(getDoctorsRemoveFromMyListMutationOptions(options), queryClient)
}
export const getDoctorsRemoveManyFromMyListUrl = () => {
  return `/api/doctors/my-list/bulk-remove`
}

export const doctorsRemoveManyFromMyList = async (
  bulkIdsRequest: BulkIdsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getDoctorsRemoveManyFromMyListUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkIdsRequest),
  })
}

export const getDoctorsRemoveManyFromMyListMutationKey = () => ['doctorsRemoveManyFromMyList'] as const

export const getDoctorsRemoveManyFromMyListMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof doctorsRemoveManyFromMyList>>,
    TError,
    DoctorsRemoveManyFromMyListMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof doctorsRemoveManyFromMyList>>,
  TError,
  DoctorsRemoveManyFromMyListMutationVariables,
  TContext
> => {
  const mutationKey = getDoctorsRemoveManyFromMyListMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof doctorsRemoveManyFromMyList>>,
    DoctorsRemoveManyFromMyListMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return doctorsRemoveManyFromMyList(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type DoctorsRemoveManyFromMyListMutationResult = NonNullable<
  Awaited<ReturnType<typeof doctorsRemoveManyFromMyList>>
>
export type DoctorsRemoveManyFromMyListMutationBody = BulkIdsRequest
export type DoctorsRemoveManyFromMyListMutationError = unknown
export type DoctorsRemoveManyFromMyListMutationVariables = { data: BulkIdsRequest }

export const useDoctorsRemoveManyFromMyList = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof doctorsRemoveManyFromMyList>>,
      TError,
      DoctorsRemoveManyFromMyListMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof doctorsRemoveManyFromMyList>>,
  TError,
  DoctorsRemoveManyFromMyListMutationVariables,
  TContext
> => {
  return useMutation(getDoctorsRemoveManyFromMyListMutationOptions(options), queryClient)
}
export const getDoctorsAssignUrl = () => {
  return `/api/doctors/assign`
}

export const doctorsAssign = async (
  assignDoctorsRequest: AssignDoctorsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<AssignDoctorsResult> => {
  return apiFetch<AssignDoctorsResult>(getDoctorsAssignUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(assignDoctorsRequest),
  })
}

export const getDoctorsAssignMutationKey = () => ['doctorsAssign'] as const

export const getDoctorsAssignMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof doctorsAssign>>,
    TError,
    DoctorsAssignMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof doctorsAssign>>,
  TError,
  DoctorsAssignMutationVariables,
  TContext
> => {
  const mutationKey = getDoctorsAssignMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof doctorsAssign>>,
    DoctorsAssignMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return doctorsAssign(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type DoctorsAssignMutationResult = NonNullable<Awaited<ReturnType<typeof doctorsAssign>>>
export type DoctorsAssignMutationBody = AssignDoctorsRequest
export type DoctorsAssignMutationError = unknown
export type DoctorsAssignMutationVariables = { data: AssignDoctorsRequest }

export const useDoctorsAssign = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof doctorsAssign>>,
      TError,
      DoctorsAssignMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof doctorsAssign>>,
  TError,
  DoctorsAssignMutationVariables,
  TContext
> => {
  return useMutation(getDoctorsAssignMutationOptions(options), queryClient)
}
