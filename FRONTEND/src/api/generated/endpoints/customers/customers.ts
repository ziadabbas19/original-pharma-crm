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
  CreateHospitalRequest,
  CreatePharmacyRequest,
  CustomerDto,
  CustomersListParams,
  CustomersSimilarParams,
  ProblemDetails,
  SimilarCustomerDto,
  TownDto,
  UpdateCustomerRequest,
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

export const getCustomersListUrl = (params?: CustomersListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/customers?${stringifiedParams}` : `/api/customers`
}

export const customersList = async (
  params?: CustomersListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<CustomerDto[]> => {
  return apiFetch<CustomerDto[]>(getCustomersListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getCustomersListQueryKey = (params?: CustomersListParams) => {
  return [`/api/customers`, ...(params ? [params] : [])] as const
}

export const getCustomersListQueryOptions = <
  TData = Awaited<ReturnType<typeof customersList>>,
  TError = unknown,
>(
  params?: CustomersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getCustomersListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof customersList>>> = ({ signal }) =>
    customersList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof customersList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type CustomersListQueryResult = NonNullable<Awaited<ReturnType<typeof customersList>>>
export type CustomersListQueryError = unknown

export function useCustomersList<TData = Awaited<ReturnType<typeof customersList>>, TError = unknown>(
  params: undefined | CustomersListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof customersList>>,
          TError,
          Awaited<ReturnType<typeof customersList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersList<TData = Awaited<ReturnType<typeof customersList>>, TError = unknown>(
  params?: CustomersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof customersList>>,
          TError,
          Awaited<ReturnType<typeof customersList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersList<TData = Awaited<ReturnType<typeof customersList>>, TError = unknown>(
  params?: CustomersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersList<TData = Awaited<ReturnType<typeof customersList>>, TError = unknown>(
  params?: CustomersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getCustomersListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getCustomersSimilarUrl = (params?: CustomersSimilarParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/customers/similar?${stringifiedParams}`
    : `/api/customers/similar`
}

export const customersSimilar = async (
  params?: CustomersSimilarParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<SimilarCustomerDto[]> => {
  return apiFetch<SimilarCustomerDto[]>(getCustomersSimilarUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getCustomersSimilarQueryKey = (params?: CustomersSimilarParams) => {
  return [`/api/customers/similar`, ...(params ? [params] : [])] as const
}

export const getCustomersSimilarQueryOptions = <
  TData = Awaited<ReturnType<typeof customersSimilar>>,
  TError = unknown,
>(
  params?: CustomersSimilarParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersSimilar>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getCustomersSimilarQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof customersSimilar>>> = ({ signal }) =>
    customersSimilar(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof customersSimilar>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type CustomersSimilarQueryResult = NonNullable<Awaited<ReturnType<typeof customersSimilar>>>
export type CustomersSimilarQueryError = unknown

export function useCustomersSimilar<TData = Awaited<ReturnType<typeof customersSimilar>>, TError = unknown>(
  params: undefined | CustomersSimilarParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersSimilar>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof customersSimilar>>,
          TError,
          Awaited<ReturnType<typeof customersSimilar>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersSimilar<TData = Awaited<ReturnType<typeof customersSimilar>>, TError = unknown>(
  params?: CustomersSimilarParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersSimilar>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof customersSimilar>>,
          TError,
          Awaited<ReturnType<typeof customersSimilar>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersSimilar<TData = Awaited<ReturnType<typeof customersSimilar>>, TError = unknown>(
  params?: CustomersSimilarParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersSimilar>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersSimilar<TData = Awaited<ReturnType<typeof customersSimilar>>, TError = unknown>(
  params?: CustomersSimilarParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersSimilar>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getCustomersSimilarQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getCustomersPharmacyTownsUrl = () => {
  return `/api/customers/pharmacy-towns`
}

export const customersPharmacyTowns = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<TownDto[]> => {
  return apiFetch<TownDto[]>(getCustomersPharmacyTownsUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getCustomersPharmacyTownsQueryKey = () => {
  return [`/api/customers/pharmacy-towns`] as const
}

export const getCustomersPharmacyTownsQueryOptions = <
  TData = Awaited<ReturnType<typeof customersPharmacyTowns>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersPharmacyTowns>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getCustomersPharmacyTownsQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof customersPharmacyTowns>>> = ({ signal }) =>
    customersPharmacyTowns({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof customersPharmacyTowns>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type CustomersPharmacyTownsQueryResult = NonNullable<
  Awaited<ReturnType<typeof customersPharmacyTowns>>
>
export type CustomersPharmacyTownsQueryError = unknown

export function useCustomersPharmacyTowns<
  TData = Awaited<ReturnType<typeof customersPharmacyTowns>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersPharmacyTowns>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof customersPharmacyTowns>>,
          TError,
          Awaited<ReturnType<typeof customersPharmacyTowns>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersPharmacyTowns<
  TData = Awaited<ReturnType<typeof customersPharmacyTowns>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersPharmacyTowns>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof customersPharmacyTowns>>,
          TError,
          Awaited<ReturnType<typeof customersPharmacyTowns>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersPharmacyTowns<
  TData = Awaited<ReturnType<typeof customersPharmacyTowns>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersPharmacyTowns>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersPharmacyTowns<
  TData = Awaited<ReturnType<typeof customersPharmacyTowns>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersPharmacyTowns>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getCustomersPharmacyTownsQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getCustomersCreatePharmacyUrl = () => {
  return `/api/customers/pharmacies`
}

export const customersCreatePharmacy = async (
  createPharmacyRequest: CreatePharmacyRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<CustomerDto> => {
  return apiFetch<CustomerDto>(getCustomersCreatePharmacyUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createPharmacyRequest),
  })
}

export const getCustomersCreatePharmacyMutationKey = () => ['customersCreatePharmacy'] as const

export const getCustomersCreatePharmacyMutationOptions = <
  TError = ProblemDetails,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof customersCreatePharmacy>>,
    TError,
    CustomersCreatePharmacyMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof customersCreatePharmacy>>,
  TError,
  CustomersCreatePharmacyMutationVariables,
  TContext
> => {
  const mutationKey = getCustomersCreatePharmacyMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof customersCreatePharmacy>>,
    CustomersCreatePharmacyMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return customersCreatePharmacy(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type CustomersCreatePharmacyMutationResult = NonNullable<
  Awaited<ReturnType<typeof customersCreatePharmacy>>
>
export type CustomersCreatePharmacyMutationBody = CreatePharmacyRequest
export type CustomersCreatePharmacyMutationError = ProblemDetails
export type CustomersCreatePharmacyMutationVariables = { data: CreatePharmacyRequest }

export const useCustomersCreatePharmacy = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof customersCreatePharmacy>>,
      TError,
      CustomersCreatePharmacyMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof customersCreatePharmacy>>,
  TError,
  CustomersCreatePharmacyMutationVariables,
  TContext
> => {
  return useMutation(getCustomersCreatePharmacyMutationOptions(options), queryClient)
}
export const getCustomersHospitalTownsUrl = () => {
  return `/api/customers/hospital-towns`
}

export const customersHospitalTowns = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<TownDto[]> => {
  return apiFetch<TownDto[]>(getCustomersHospitalTownsUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getCustomersHospitalTownsQueryKey = () => {
  return [`/api/customers/hospital-towns`] as const
}

export const getCustomersHospitalTownsQueryOptions = <
  TData = Awaited<ReturnType<typeof customersHospitalTowns>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersHospitalTowns>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getCustomersHospitalTownsQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof customersHospitalTowns>>> = ({ signal }) =>
    customersHospitalTowns({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof customersHospitalTowns>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type CustomersHospitalTownsQueryResult = NonNullable<
  Awaited<ReturnType<typeof customersHospitalTowns>>
>
export type CustomersHospitalTownsQueryError = unknown

export function useCustomersHospitalTowns<
  TData = Awaited<ReturnType<typeof customersHospitalTowns>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersHospitalTowns>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof customersHospitalTowns>>,
          TError,
          Awaited<ReturnType<typeof customersHospitalTowns>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersHospitalTowns<
  TData = Awaited<ReturnType<typeof customersHospitalTowns>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersHospitalTowns>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof customersHospitalTowns>>,
          TError,
          Awaited<ReturnType<typeof customersHospitalTowns>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersHospitalTowns<
  TData = Awaited<ReturnType<typeof customersHospitalTowns>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersHospitalTowns>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useCustomersHospitalTowns<
  TData = Awaited<ReturnType<typeof customersHospitalTowns>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof customersHospitalTowns>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getCustomersHospitalTownsQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getCustomersCreateHospitalUrl = () => {
  return `/api/customers/hospitals`
}

export const customersCreateHospital = async (
  createHospitalRequest: CreateHospitalRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<CustomerDto> => {
  return apiFetch<CustomerDto>(getCustomersCreateHospitalUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createHospitalRequest),
  })
}

export const getCustomersCreateHospitalMutationKey = () => ['customersCreateHospital'] as const

export const getCustomersCreateHospitalMutationOptions = <
  TError = ProblemDetails,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof customersCreateHospital>>,
    TError,
    CustomersCreateHospitalMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof customersCreateHospital>>,
  TError,
  CustomersCreateHospitalMutationVariables,
  TContext
> => {
  const mutationKey = getCustomersCreateHospitalMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof customersCreateHospital>>,
    CustomersCreateHospitalMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return customersCreateHospital(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type CustomersCreateHospitalMutationResult = NonNullable<
  Awaited<ReturnType<typeof customersCreateHospital>>
>
export type CustomersCreateHospitalMutationBody = CreateHospitalRequest
export type CustomersCreateHospitalMutationError = ProblemDetails
export type CustomersCreateHospitalMutationVariables = { data: CreateHospitalRequest }

export const useCustomersCreateHospital = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof customersCreateHospital>>,
      TError,
      CustomersCreateHospitalMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof customersCreateHospital>>,
  TError,
  CustomersCreateHospitalMutationVariables,
  TContext
> => {
  return useMutation(getCustomersCreateHospitalMutationOptions(options), queryClient)
}
export const getCustomersUpdateUrl = (id: string) => {
  return `/api/customers/${id}`
}

export const customersUpdate = async (
  id: string,
  updateCustomerRequest: UpdateCustomerRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<CustomerDto> => {
  return apiFetch<CustomerDto>(getCustomersUpdateUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateCustomerRequest),
  })
}

export const getCustomersUpdateMutationKey = () => ['customersUpdate'] as const

export const getCustomersUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof customersUpdate>>,
    TError,
    CustomersUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof customersUpdate>>,
  TError,
  CustomersUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getCustomersUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof customersUpdate>>,
    CustomersUpdateMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return customersUpdate(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type CustomersUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof customersUpdate>>>
export type CustomersUpdateMutationBody = UpdateCustomerRequest
export type CustomersUpdateMutationError = unknown
export type CustomersUpdateMutationVariables = { id: string; data: UpdateCustomerRequest }

export const useCustomersUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof customersUpdate>>,
      TError,
      CustomersUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof customersUpdate>>,
  TError,
  CustomersUpdateMutationVariables,
  TContext
> => {
  return useMutation(getCustomersUpdateMutationOptions(options), queryClient)
}
export const getCustomersBulkDeleteUrl = () => {
  return `/api/customers/bulk-delete`
}

export const customersBulkDelete = async (
  bulkDeleteRequest: BulkDeleteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getCustomersBulkDeleteUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkDeleteRequest),
  })
}

export const getCustomersBulkDeleteMutationKey = () => ['customersBulkDelete'] as const

export const getCustomersBulkDeleteMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof customersBulkDelete>>,
    TError,
    CustomersBulkDeleteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof customersBulkDelete>>,
  TError,
  CustomersBulkDeleteMutationVariables,
  TContext
> => {
  const mutationKey = getCustomersBulkDeleteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof customersBulkDelete>>,
    CustomersBulkDeleteMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return customersBulkDelete(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type CustomersBulkDeleteMutationResult = NonNullable<Awaited<ReturnType<typeof customersBulkDelete>>>
export type CustomersBulkDeleteMutationBody = BulkDeleteRequest
export type CustomersBulkDeleteMutationError = unknown
export type CustomersBulkDeleteMutationVariables = { data: BulkDeleteRequest }

export const useCustomersBulkDelete = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof customersBulkDelete>>,
      TError,
      CustomersBulkDeleteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof customersBulkDelete>>,
  TError,
  CustomersBulkDeleteMutationVariables,
  TContext
> => {
  return useMutation(getCustomersBulkDeleteMutationOptions(options), queryClient)
}
export const getCustomersBulkRestoreUrl = () => {
  return `/api/customers/bulk-restore`
}

export const customersBulkRestore = async (
  bulkIdsRequest: BulkIdsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getCustomersBulkRestoreUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkIdsRequest),
  })
}

export const getCustomersBulkRestoreMutationKey = () => ['customersBulkRestore'] as const

export const getCustomersBulkRestoreMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof customersBulkRestore>>,
    TError,
    CustomersBulkRestoreMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof customersBulkRestore>>,
  TError,
  CustomersBulkRestoreMutationVariables,
  TContext
> => {
  const mutationKey = getCustomersBulkRestoreMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof customersBulkRestore>>,
    CustomersBulkRestoreMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return customersBulkRestore(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type CustomersBulkRestoreMutationResult = NonNullable<Awaited<ReturnType<typeof customersBulkRestore>>>
export type CustomersBulkRestoreMutationBody = BulkIdsRequest
export type CustomersBulkRestoreMutationError = unknown
export type CustomersBulkRestoreMutationVariables = { data: BulkIdsRequest }

export const useCustomersBulkRestore = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof customersBulkRestore>>,
      TError,
      CustomersBulkRestoreMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof customersBulkRestore>>,
  TError,
  CustomersBulkRestoreMutationVariables,
  TContext
> => {
  return useMutation(getCustomersBulkRestoreMutationOptions(options), queryClient)
}
