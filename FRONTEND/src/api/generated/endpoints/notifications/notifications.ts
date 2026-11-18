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
  NotificationCountDto,
  NotificationDto,
  NotificationsListParams,
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

export const getNotificationsListUrl = (params?: NotificationsListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/notifications?${stringifiedParams}` : `/api/notifications`
}

export const notificationsList = async (
  params?: NotificationsListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<NotificationDto[]> => {
  return apiFetch<NotificationDto[]>(getNotificationsListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getNotificationsListQueryKey = (params?: NotificationsListParams) => {
  return [`/api/notifications`, ...(params ? [params] : [])] as const
}

export const getNotificationsListQueryOptions = <
  TData = Awaited<ReturnType<typeof notificationsList>>,
  TError = unknown,
>(
  params?: NotificationsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getNotificationsListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof notificationsList>>> = ({ signal }) =>
    notificationsList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof notificationsList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type NotificationsListQueryResult = NonNullable<Awaited<ReturnType<typeof notificationsList>>>
export type NotificationsListQueryError = unknown

export function useNotificationsList<TData = Awaited<ReturnType<typeof notificationsList>>, TError = unknown>(
  params: undefined | NotificationsListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof notificationsList>>,
          TError,
          Awaited<ReturnType<typeof notificationsList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotificationsList<TData = Awaited<ReturnType<typeof notificationsList>>, TError = unknown>(
  params?: NotificationsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof notificationsList>>,
          TError,
          Awaited<ReturnType<typeof notificationsList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotificationsList<TData = Awaited<ReturnType<typeof notificationsList>>, TError = unknown>(
  params?: NotificationsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotificationsList<TData = Awaited<ReturnType<typeof notificationsList>>, TError = unknown>(
  params?: NotificationsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getNotificationsListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getNotificationsUnreadCountUrl = () => {
  return `/api/notifications/unread-count`
}

export const notificationsUnreadCount = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<NotificationCountDto> => {
  return apiFetch<NotificationCountDto>(getNotificationsUnreadCountUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getNotificationsUnreadCountQueryKey = () => {
  return [`/api/notifications/unread-count`] as const
}

export const getNotificationsUnreadCountQueryOptions = <
  TData = Awaited<ReturnType<typeof notificationsUnreadCount>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsUnreadCount>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getNotificationsUnreadCountQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof notificationsUnreadCount>>> = ({ signal }) =>
    notificationsUnreadCount({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof notificationsUnreadCount>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type NotificationsUnreadCountQueryResult = NonNullable<
  Awaited<ReturnType<typeof notificationsUnreadCount>>
>
export type NotificationsUnreadCountQueryError = unknown

export function useNotificationsUnreadCount<
  TData = Awaited<ReturnType<typeof notificationsUnreadCount>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsUnreadCount>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof notificationsUnreadCount>>,
          TError,
          Awaited<ReturnType<typeof notificationsUnreadCount>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotificationsUnreadCount<
  TData = Awaited<ReturnType<typeof notificationsUnreadCount>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsUnreadCount>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof notificationsUnreadCount>>,
          TError,
          Awaited<ReturnType<typeof notificationsUnreadCount>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotificationsUnreadCount<
  TData = Awaited<ReturnType<typeof notificationsUnreadCount>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsUnreadCount>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotificationsUnreadCount<
  TData = Awaited<ReturnType<typeof notificationsUnreadCount>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notificationsUnreadCount>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getNotificationsUnreadCountQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getNotificationsMarkReadUrl = () => {
  return `/api/notifications/read`
}

export const notificationsMarkRead = async (
  bulkIdsRequest: BulkIdsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getNotificationsMarkReadUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkIdsRequest),
  })
}

export const getNotificationsMarkReadMutationKey = () => ['notificationsMarkRead'] as const

export const getNotificationsMarkReadMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof notificationsMarkRead>>,
    TError,
    NotificationsMarkReadMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof notificationsMarkRead>>,
  TError,
  NotificationsMarkReadMutationVariables,
  TContext
> => {
  const mutationKey = getNotificationsMarkReadMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof notificationsMarkRead>>,
    NotificationsMarkReadMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return notificationsMarkRead(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotificationsMarkReadMutationResult = NonNullable<
  Awaited<ReturnType<typeof notificationsMarkRead>>
>
export type NotificationsMarkReadMutationBody = BulkIdsRequest
export type NotificationsMarkReadMutationError = unknown
export type NotificationsMarkReadMutationVariables = { data: BulkIdsRequest }

export const useNotificationsMarkRead = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notificationsMarkRead>>,
      TError,
      NotificationsMarkReadMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof notificationsMarkRead>>,
  TError,
  NotificationsMarkReadMutationVariables,
  TContext
> => {
  return useMutation(getNotificationsMarkReadMutationOptions(options), queryClient)
}
export const getNotificationsMarkAllReadUrl = () => {
  return `/api/notifications/read-all`
}

export const notificationsMarkAllRead = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<NotificationCountDto> => {
  return apiFetch<NotificationCountDto>(getNotificationsMarkAllReadUrl(), {
    ...options,
    method: 'POST',
  })
}

export const getNotificationsMarkAllReadMutationKey = () => ['notificationsMarkAllRead'] as const

export const getNotificationsMarkAllReadMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof notificationsMarkAllRead>>, TError, void, TContext>
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<Awaited<ReturnType<typeof notificationsMarkAllRead>>, TError, void, TContext> => {
  const mutationKey = getNotificationsMarkAllReadMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<Awaited<ReturnType<typeof notificationsMarkAllRead>>, void> = () => {
    return notificationsMarkAllRead(requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotificationsMarkAllReadMutationResult = NonNullable<
  Awaited<ReturnType<typeof notificationsMarkAllRead>>
>

export type NotificationsMarkAllReadMutationError = unknown

export const useNotificationsMarkAllRead = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notificationsMarkAllRead>>,
      TError,
      void,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<Awaited<ReturnType<typeof notificationsMarkAllRead>>, TError, void, TContext> => {
  return useMutation(getNotificationsMarkAllReadMutationOptions(options), queryClient)
}
export const getNotificationsBulkDeleteUrl = () => {
  return `/api/notifications/bulk-delete`
}

export const notificationsBulkDelete = async (
  bulkDeleteRequest: BulkDeleteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getNotificationsBulkDeleteUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkDeleteRequest),
  })
}

export const getNotificationsBulkDeleteMutationKey = () => ['notificationsBulkDelete'] as const

export const getNotificationsBulkDeleteMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof notificationsBulkDelete>>,
    TError,
    NotificationsBulkDeleteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof notificationsBulkDelete>>,
  TError,
  NotificationsBulkDeleteMutationVariables,
  TContext
> => {
  const mutationKey = getNotificationsBulkDeleteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof notificationsBulkDelete>>,
    NotificationsBulkDeleteMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return notificationsBulkDelete(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotificationsBulkDeleteMutationResult = NonNullable<
  Awaited<ReturnType<typeof notificationsBulkDelete>>
>
export type NotificationsBulkDeleteMutationBody = BulkDeleteRequest
export type NotificationsBulkDeleteMutationError = unknown
export type NotificationsBulkDeleteMutationVariables = { data: BulkDeleteRequest }

export const useNotificationsBulkDelete = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notificationsBulkDelete>>,
      TError,
      NotificationsBulkDeleteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof notificationsBulkDelete>>,
  TError,
  NotificationsBulkDeleteMutationVariables,
  TContext
> => {
  return useMutation(getNotificationsBulkDeleteMutationOptions(options), queryClient)
}
