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
  CreateOrderRequest,
  OrderDto,
  OrderListItemDto,
  OrderStatusRequest,
  OrdersExportParams,
  OrdersListParams,
  OrdersPlacesParams,
  PlaceSuggestionDto,
  Stream,
  UpdateOrderRequest,
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

export const getOrdersListUrl = (params?: OrdersListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/orders?${stringifiedParams}` : `/api/orders`
}

export const ordersList = async (
  params?: OrdersListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<OrderListItemDto[]> => {
  return apiFetch<OrderListItemDto[]>(getOrdersListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getOrdersListQueryKey = (params?: OrdersListParams) => {
  return [`/api/orders`, ...(params ? [params] : [])] as const
}

export const getOrdersListQueryOptions = <TData = Awaited<ReturnType<typeof ordersList>>, TError = unknown>(
  params?: OrdersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getOrdersListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof ordersList>>> = ({ signal }) =>
    ordersList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof ordersList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type OrdersListQueryResult = NonNullable<Awaited<ReturnType<typeof ordersList>>>
export type OrdersListQueryError = unknown

export function useOrdersList<TData = Awaited<ReturnType<typeof ordersList>>, TError = unknown>(
  params: undefined | OrdersListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof ordersList>>,
          TError,
          Awaited<ReturnType<typeof ordersList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersList<TData = Awaited<ReturnType<typeof ordersList>>, TError = unknown>(
  params?: OrdersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof ordersList>>,
          TError,
          Awaited<ReturnType<typeof ordersList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersList<TData = Awaited<ReturnType<typeof ordersList>>, TError = unknown>(
  params?: OrdersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersList<TData = Awaited<ReturnType<typeof ordersList>>, TError = unknown>(
  params?: OrdersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getOrdersListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getOrdersCreateUrl = () => {
  return `/api/orders`
}

export const ordersCreate = async (
  createOrderRequest: CreateOrderRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<OrderDto> => {
  return apiFetch<OrderDto>(getOrdersCreateUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createOrderRequest),
  })
}

export const getOrdersCreateMutationKey = () => ['ordersCreate'] as const

export const getOrdersCreateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof ordersCreate>>,
    TError,
    OrdersCreateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof ordersCreate>>,
  TError,
  OrdersCreateMutationVariables,
  TContext
> => {
  const mutationKey = getOrdersCreateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof ordersCreate>>,
    OrdersCreateMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return ordersCreate(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type OrdersCreateMutationResult = NonNullable<Awaited<ReturnType<typeof ordersCreate>>>
export type OrdersCreateMutationBody = CreateOrderRequest
export type OrdersCreateMutationError = unknown
export type OrdersCreateMutationVariables = { data: CreateOrderRequest }

export const useOrdersCreate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof ordersCreate>>,
      TError,
      OrdersCreateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof ordersCreate>>,
  TError,
  OrdersCreateMutationVariables,
  TContext
> => {
  return useMutation(getOrdersCreateMutationOptions(options), queryClient)
}
export const getOrdersExportUrl = (params?: OrdersExportParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/orders/export?${stringifiedParams}` : `/api/orders/export`
}

export const ordersExport = async (
  params?: OrdersExportParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<Stream> => {
  return apiFetch<Stream>(getOrdersExportUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getOrdersExportQueryKey = (params?: OrdersExportParams) => {
  return [`/api/orders/export`, ...(params ? [params] : [])] as const
}

export const getOrdersExportQueryOptions = <
  TData = Awaited<ReturnType<typeof ordersExport>>,
  TError = unknown,
>(
  params?: OrdersExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getOrdersExportQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof ordersExport>>> = ({ signal }) =>
    ordersExport(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof ordersExport>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type OrdersExportQueryResult = NonNullable<Awaited<ReturnType<typeof ordersExport>>>
export type OrdersExportQueryError = unknown

export function useOrdersExport<TData = Awaited<ReturnType<typeof ordersExport>>, TError = unknown>(
  params: undefined | OrdersExportParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersExport>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof ordersExport>>,
          TError,
          Awaited<ReturnType<typeof ordersExport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersExport<TData = Awaited<ReturnType<typeof ordersExport>>, TError = unknown>(
  params?: OrdersExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersExport>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof ordersExport>>,
          TError,
          Awaited<ReturnType<typeof ordersExport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersExport<TData = Awaited<ReturnType<typeof ordersExport>>, TError = unknown>(
  params?: OrdersExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersExport<TData = Awaited<ReturnType<typeof ordersExport>>, TError = unknown>(
  params?: OrdersExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getOrdersExportQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getOrdersPlacesUrl = (params?: OrdersPlacesParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/orders/places?${stringifiedParams}` : `/api/orders/places`
}

export const ordersPlaces = async (
  params?: OrdersPlacesParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<PlaceSuggestionDto[]> => {
  return apiFetch<PlaceSuggestionDto[]>(getOrdersPlacesUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getOrdersPlacesQueryKey = (params?: OrdersPlacesParams) => {
  return [`/api/orders/places`, ...(params ? [params] : [])] as const
}

export const getOrdersPlacesQueryOptions = <
  TData = Awaited<ReturnType<typeof ordersPlaces>>,
  TError = unknown,
>(
  params?: OrdersPlacesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersPlaces>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getOrdersPlacesQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof ordersPlaces>>> = ({ signal }) =>
    ordersPlaces(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof ordersPlaces>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type OrdersPlacesQueryResult = NonNullable<Awaited<ReturnType<typeof ordersPlaces>>>
export type OrdersPlacesQueryError = unknown

export function useOrdersPlaces<TData = Awaited<ReturnType<typeof ordersPlaces>>, TError = unknown>(
  params: undefined | OrdersPlacesParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersPlaces>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof ordersPlaces>>,
          TError,
          Awaited<ReturnType<typeof ordersPlaces>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersPlaces<TData = Awaited<ReturnType<typeof ordersPlaces>>, TError = unknown>(
  params?: OrdersPlacesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersPlaces>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof ordersPlaces>>,
          TError,
          Awaited<ReturnType<typeof ordersPlaces>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersPlaces<TData = Awaited<ReturnType<typeof ordersPlaces>>, TError = unknown>(
  params?: OrdersPlacesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersPlaces>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersPlaces<TData = Awaited<ReturnType<typeof ordersPlaces>>, TError = unknown>(
  params?: OrdersPlacesParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersPlaces>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getOrdersPlacesQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getOrdersGetUrl = (id: string) => {
  return `/api/orders/${id}`
}

export const ordersGet = async (id: string, options?: Parameters<typeof apiFetch>[1]): Promise<OrderDto> => {
  return apiFetch<OrderDto>(getOrdersGetUrl(id), {
    ...options,
    method: 'GET',
  })
}

export const getOrdersGetQueryKey = (id: string) => {
  return [`/api/orders/${id}`] as const
}

export const getOrdersGetQueryOptions = <TData = Awaited<ReturnType<typeof ordersGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getOrdersGetQueryKey(id)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof ordersGet>>> = ({ signal }) =>
    ordersGet(id, { signal, ...requestOptions })

  return { queryKey, queryFn, enabled: id !== null && id !== undefined, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof ordersGet>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type OrdersGetQueryResult = NonNullable<Awaited<ReturnType<typeof ordersGet>>>
export type OrdersGetQueryError = unknown

export function useOrdersGet<TData = Awaited<ReturnType<typeof ordersGet>>, TError = unknown>(
  id: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersGet>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof ordersGet>>,
          TError,
          Awaited<ReturnType<typeof ordersGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersGet<TData = Awaited<ReturnType<typeof ordersGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersGet>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof ordersGet>>,
          TError,
          Awaited<ReturnType<typeof ordersGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersGet<TData = Awaited<ReturnType<typeof ordersGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useOrdersGet<TData = Awaited<ReturnType<typeof ordersGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof ordersGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getOrdersGetQueryOptions(id, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getOrdersUpdateUrl = (id: string) => {
  return `/api/orders/${id}`
}

export const ordersUpdate = async (
  id: string,
  updateOrderRequest: UpdateOrderRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<OrderDto> => {
  return apiFetch<OrderDto>(getOrdersUpdateUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateOrderRequest),
  })
}

export const getOrdersUpdateMutationKey = () => ['ordersUpdate'] as const

export const getOrdersUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof ordersUpdate>>,
    TError,
    OrdersUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof ordersUpdate>>,
  TError,
  OrdersUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getOrdersUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof ordersUpdate>>,
    OrdersUpdateMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return ordersUpdate(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type OrdersUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof ordersUpdate>>>
export type OrdersUpdateMutationBody = UpdateOrderRequest
export type OrdersUpdateMutationError = unknown
export type OrdersUpdateMutationVariables = { id: string; data: UpdateOrderRequest }

export const useOrdersUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof ordersUpdate>>,
      TError,
      OrdersUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof ordersUpdate>>,
  TError,
  OrdersUpdateMutationVariables,
  TContext
> => {
  return useMutation(getOrdersUpdateMutationOptions(options), queryClient)
}
export const getOrdersApproveUrl = (id: string) => {
  return `/api/orders/${id}/approve`
}

export const ordersApprove = async (
  id: string,
  orderStatusRequest: OrderStatusRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<OrderDto> => {
  return apiFetch<OrderDto>(getOrdersApproveUrl(id), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(orderStatusRequest),
  })
}

export const getOrdersApproveMutationKey = () => ['ordersApprove'] as const

export const getOrdersApproveMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof ordersApprove>>,
    TError,
    OrdersApproveMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof ordersApprove>>,
  TError,
  OrdersApproveMutationVariables,
  TContext
> => {
  const mutationKey = getOrdersApproveMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof ordersApprove>>,
    OrdersApproveMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return ordersApprove(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type OrdersApproveMutationResult = NonNullable<Awaited<ReturnType<typeof ordersApprove>>>
export type OrdersApproveMutationBody = OrderStatusRequest
export type OrdersApproveMutationError = unknown
export type OrdersApproveMutationVariables = { id: string; data: OrderStatusRequest }

export const useOrdersApprove = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof ordersApprove>>,
      TError,
      OrdersApproveMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof ordersApprove>>,
  TError,
  OrdersApproveMutationVariables,
  TContext
> => {
  return useMutation(getOrdersApproveMutationOptions(options), queryClient)
}
export const getOrdersRejectUrl = (id: string) => {
  return `/api/orders/${id}/reject`
}

export const ordersReject = async (
  id: string,
  orderStatusRequest: OrderStatusRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<OrderDto> => {
  return apiFetch<OrderDto>(getOrdersRejectUrl(id), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(orderStatusRequest),
  })
}

export const getOrdersRejectMutationKey = () => ['ordersReject'] as const

export const getOrdersRejectMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof ordersReject>>,
    TError,
    OrdersRejectMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof ordersReject>>,
  TError,
  OrdersRejectMutationVariables,
  TContext
> => {
  const mutationKey = getOrdersRejectMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof ordersReject>>,
    OrdersRejectMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return ordersReject(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type OrdersRejectMutationResult = NonNullable<Awaited<ReturnType<typeof ordersReject>>>
export type OrdersRejectMutationBody = OrderStatusRequest
export type OrdersRejectMutationError = unknown
export type OrdersRejectMutationVariables = { id: string; data: OrderStatusRequest }

export const useOrdersReject = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof ordersReject>>,
      TError,
      OrdersRejectMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof ordersReject>>,
  TError,
  OrdersRejectMutationVariables,
  TContext
> => {
  return useMutation(getOrdersRejectMutationOptions(options), queryClient)
}
export const getOrdersCancelUrl = (id: string) => {
  return `/api/orders/${id}/cancel`
}

export const ordersCancel = async (
  id: string,
  orderStatusRequest: OrderStatusRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<OrderDto> => {
  return apiFetch<OrderDto>(getOrdersCancelUrl(id), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(orderStatusRequest),
  })
}

export const getOrdersCancelMutationKey = () => ['ordersCancel'] as const

export const getOrdersCancelMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof ordersCancel>>,
    TError,
    OrdersCancelMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof ordersCancel>>,
  TError,
  OrdersCancelMutationVariables,
  TContext
> => {
  const mutationKey = getOrdersCancelMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof ordersCancel>>,
    OrdersCancelMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return ordersCancel(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type OrdersCancelMutationResult = NonNullable<Awaited<ReturnType<typeof ordersCancel>>>
export type OrdersCancelMutationBody = OrderStatusRequest
export type OrdersCancelMutationError = unknown
export type OrdersCancelMutationVariables = { id: string; data: OrderStatusRequest }

export const useOrdersCancel = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof ordersCancel>>,
      TError,
      OrdersCancelMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof ordersCancel>>,
  TError,
  OrdersCancelMutationVariables,
  TContext
> => {
  return useMutation(getOrdersCancelMutationOptions(options), queryClient)
}
