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
  CreateUserRequest,
  CreatedUserDto,
  PermissionOverrideDto,
  ResetPasswordRequest,
  RoleSummaryDto,
  SetPermissionOverridesRequest,
  SetUserProductLinesRequest,
  SetUserRolesRequest,
  TemporaryPasswordDto,
  UpdateUserRequest,
  UserAuditEntryDto,
  UserListItemDto,
  UserSessionDto,
  UsersGetAuditParams,
  UsersListParams,
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

export const getUsersListUrl = (params?: UsersListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/users?${stringifiedParams}` : `/api/users`
}

export const usersList = async (
  params?: UsersListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<UserListItemDto[]> => {
  return apiFetch<UserListItemDto[]>(getUsersListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getUsersListQueryKey = (params?: UsersListParams) => {
  return [`/api/users`, ...(params ? [params] : [])] as const
}

export const getUsersListQueryOptions = <TData = Awaited<ReturnType<typeof usersList>>, TError = unknown>(
  params?: UsersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getUsersListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof usersList>>> = ({ signal }) =>
    usersList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof usersList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type UsersListQueryResult = NonNullable<Awaited<ReturnType<typeof usersList>>>
export type UsersListQueryError = unknown

export function useUsersList<TData = Awaited<ReturnType<typeof usersList>>, TError = unknown>(
  params: undefined | UsersListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersList>>,
          TError,
          Awaited<ReturnType<typeof usersList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersList<TData = Awaited<ReturnType<typeof usersList>>, TError = unknown>(
  params?: UsersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersList>>,
          TError,
          Awaited<ReturnType<typeof usersList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersList<TData = Awaited<ReturnType<typeof usersList>>, TError = unknown>(
  params?: UsersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersList<TData = Awaited<ReturnType<typeof usersList>>, TError = unknown>(
  params?: UsersListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getUsersListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getUsersCreateUrl = () => {
  return `/api/users`
}

export const usersCreate = async (
  createUserRequest: CreateUserRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<CreatedUserDto> => {
  return apiFetch<CreatedUserDto>(getUsersCreateUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createUserRequest),
  })
}

export const getUsersCreateMutationKey = () => ['usersCreate'] as const

export const getUsersCreateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersCreate>>,
    TError,
    UsersCreateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersCreate>>,
  TError,
  UsersCreateMutationVariables,
  TContext
> => {
  const mutationKey = getUsersCreateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersCreate>>,
    UsersCreateMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return usersCreate(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersCreateMutationResult = NonNullable<Awaited<ReturnType<typeof usersCreate>>>
export type UsersCreateMutationBody = CreateUserRequest
export type UsersCreateMutationError = unknown
export type UsersCreateMutationVariables = { data: CreateUserRequest }

export const useUsersCreate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersCreate>>,
      TError,
      UsersCreateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersCreate>>,
  TError,
  UsersCreateMutationVariables,
  TContext
> => {
  return useMutation(getUsersCreateMutationOptions(options), queryClient)
}
export const getUsersBulkDeleteUrl = () => {
  return `/api/users/bulk-delete`
}

export const usersBulkDelete = async (
  bulkDeleteRequest: BulkDeleteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getUsersBulkDeleteUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkDeleteRequest),
  })
}

export const getUsersBulkDeleteMutationKey = () => ['usersBulkDelete'] as const

export const getUsersBulkDeleteMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersBulkDelete>>,
    TError,
    UsersBulkDeleteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersBulkDelete>>,
  TError,
  UsersBulkDeleteMutationVariables,
  TContext
> => {
  const mutationKey = getUsersBulkDeleteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersBulkDelete>>,
    UsersBulkDeleteMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return usersBulkDelete(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersBulkDeleteMutationResult = NonNullable<Awaited<ReturnType<typeof usersBulkDelete>>>
export type UsersBulkDeleteMutationBody = BulkDeleteRequest
export type UsersBulkDeleteMutationError = unknown
export type UsersBulkDeleteMutationVariables = { data: BulkDeleteRequest }

export const useUsersBulkDelete = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersBulkDelete>>,
      TError,
      UsersBulkDeleteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersBulkDelete>>,
  TError,
  UsersBulkDeleteMutationVariables,
  TContext
> => {
  return useMutation(getUsersBulkDeleteMutationOptions(options), queryClient)
}
export const getUsersBulkRestoreUrl = () => {
  return `/api/users/bulk-restore`
}

export const usersBulkRestore = async (
  bulkIdsRequest: BulkIdsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getUsersBulkRestoreUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkIdsRequest),
  })
}

export const getUsersBulkRestoreMutationKey = () => ['usersBulkRestore'] as const

export const getUsersBulkRestoreMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersBulkRestore>>,
    TError,
    UsersBulkRestoreMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersBulkRestore>>,
  TError,
  UsersBulkRestoreMutationVariables,
  TContext
> => {
  const mutationKey = getUsersBulkRestoreMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersBulkRestore>>,
    UsersBulkRestoreMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return usersBulkRestore(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersBulkRestoreMutationResult = NonNullable<Awaited<ReturnType<typeof usersBulkRestore>>>
export type UsersBulkRestoreMutationBody = BulkIdsRequest
export type UsersBulkRestoreMutationError = unknown
export type UsersBulkRestoreMutationVariables = { data: BulkIdsRequest }

export const useUsersBulkRestore = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersBulkRestore>>,
      TError,
      UsersBulkRestoreMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersBulkRestore>>,
  TError,
  UsersBulkRestoreMutationVariables,
  TContext
> => {
  return useMutation(getUsersBulkRestoreMutationOptions(options), queryClient)
}
export const getUsersAssignableRolesUrl = () => {
  return `/api/users/assignable-roles`
}

export const usersAssignableRoles = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<RoleSummaryDto[]> => {
  return apiFetch<RoleSummaryDto[]>(getUsersAssignableRolesUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getUsersAssignableRolesQueryKey = () => {
  return [`/api/users/assignable-roles`] as const
}

export const getUsersAssignableRolesQueryOptions = <
  TData = Awaited<ReturnType<typeof usersAssignableRoles>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersAssignableRoles>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getUsersAssignableRolesQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof usersAssignableRoles>>> = ({ signal }) =>
    usersAssignableRoles({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof usersAssignableRoles>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type UsersAssignableRolesQueryResult = NonNullable<Awaited<ReturnType<typeof usersAssignableRoles>>>
export type UsersAssignableRolesQueryError = unknown

export function useUsersAssignableRoles<
  TData = Awaited<ReturnType<typeof usersAssignableRoles>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersAssignableRoles>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersAssignableRoles>>,
          TError,
          Awaited<ReturnType<typeof usersAssignableRoles>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersAssignableRoles<
  TData = Awaited<ReturnType<typeof usersAssignableRoles>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersAssignableRoles>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersAssignableRoles>>,
          TError,
          Awaited<ReturnType<typeof usersAssignableRoles>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersAssignableRoles<
  TData = Awaited<ReturnType<typeof usersAssignableRoles>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersAssignableRoles>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersAssignableRoles<
  TData = Awaited<ReturnType<typeof usersAssignableRoles>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersAssignableRoles>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getUsersAssignableRolesQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getUsersSetProductLinesUrl = (userId: string) => {
  return `/api/users/${userId}/product-lines`
}

export const usersSetProductLines = async (
  userId: string,
  setUserProductLinesRequest: SetUserProductLinesRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<UserListItemDto> => {
  return apiFetch<UserListItemDto>(getUsersSetProductLinesUrl(userId), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(setUserProductLinesRequest),
  })
}

export const getUsersSetProductLinesMutationKey = () => ['usersSetProductLines'] as const

export const getUsersSetProductLinesMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersSetProductLines>>,
    TError,
    UsersSetProductLinesMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersSetProductLines>>,
  TError,
  UsersSetProductLinesMutationVariables,
  TContext
> => {
  const mutationKey = getUsersSetProductLinesMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersSetProductLines>>,
    UsersSetProductLinesMutationVariables
  > = (props) => {
    const { userId, data } = props ?? {}

    return usersSetProductLines(userId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersSetProductLinesMutationResult = NonNullable<Awaited<ReturnType<typeof usersSetProductLines>>>
export type UsersSetProductLinesMutationBody = SetUserProductLinesRequest
export type UsersSetProductLinesMutationError = unknown
export type UsersSetProductLinesMutationVariables = { userId: string; data: SetUserProductLinesRequest }

export const useUsersSetProductLines = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersSetProductLines>>,
      TError,
      UsersSetProductLinesMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersSetProductLines>>,
  TError,
  UsersSetProductLinesMutationVariables,
  TContext
> => {
  return useMutation(getUsersSetProductLinesMutationOptions(options), queryClient)
}
export const getUsersResetPasswordUrl = (userId: string) => {
  return `/api/users/${userId}/reset-password`
}

export const usersResetPassword = async (
  userId: string,
  resetPasswordRequest: ResetPasswordRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<TemporaryPasswordDto> => {
  return apiFetch<TemporaryPasswordDto>(getUsersResetPasswordUrl(userId), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(resetPasswordRequest),
  })
}

export const getUsersResetPasswordMutationKey = () => ['usersResetPassword'] as const

export const getUsersResetPasswordMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersResetPassword>>,
    TError,
    UsersResetPasswordMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersResetPassword>>,
  TError,
  UsersResetPasswordMutationVariables,
  TContext
> => {
  const mutationKey = getUsersResetPasswordMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersResetPassword>>,
    UsersResetPasswordMutationVariables
  > = (props) => {
    const { userId, data } = props ?? {}

    return usersResetPassword(userId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersResetPasswordMutationResult = NonNullable<Awaited<ReturnType<typeof usersResetPassword>>>
export type UsersResetPasswordMutationBody = ResetPasswordRequest
export type UsersResetPasswordMutationError = unknown
export type UsersResetPasswordMutationVariables = { userId: string; data: ResetPasswordRequest }

export const useUsersResetPassword = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersResetPassword>>,
      TError,
      UsersResetPasswordMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersResetPassword>>,
  TError,
  UsersResetPasswordMutationVariables,
  TContext
> => {
  return useMutation(getUsersResetPasswordMutationOptions(options), queryClient)
}
export const getUsersListSessionsUrl = (userId: string) => {
  return `/api/users/${userId}/sessions`
}

export const usersListSessions = async (
  userId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<UserSessionDto[]> => {
  return apiFetch<UserSessionDto[]>(getUsersListSessionsUrl(userId), {
    ...options,
    method: 'GET',
  })
}

export const getUsersListSessionsQueryKey = (userId: string) => {
  return [`/api/users/${userId}/sessions`] as const
}

export const getUsersListSessionsQueryOptions = <
  TData = Awaited<ReturnType<typeof usersListSessions>>,
  TError = unknown,
>(
  userId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersListSessions>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getUsersListSessionsQueryKey(userId)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof usersListSessions>>> = ({ signal }) =>
    usersListSessions(userId, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: userId !== null && userId !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof usersListSessions>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type UsersListSessionsQueryResult = NonNullable<Awaited<ReturnType<typeof usersListSessions>>>
export type UsersListSessionsQueryError = unknown

export function useUsersListSessions<TData = Awaited<ReturnType<typeof usersListSessions>>, TError = unknown>(
  userId: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersListSessions>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersListSessions>>,
          TError,
          Awaited<ReturnType<typeof usersListSessions>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersListSessions<TData = Awaited<ReturnType<typeof usersListSessions>>, TError = unknown>(
  userId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersListSessions>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersListSessions>>,
          TError,
          Awaited<ReturnType<typeof usersListSessions>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersListSessions<TData = Awaited<ReturnType<typeof usersListSessions>>, TError = unknown>(
  userId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersListSessions>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersListSessions<TData = Awaited<ReturnType<typeof usersListSessions>>, TError = unknown>(
  userId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersListSessions>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getUsersListSessionsQueryOptions(userId, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getUsersRevokeSessionUrl = (userId: string, sessionId: string) => {
  return `/api/users/${userId}/sessions/${sessionId}`
}

export const usersRevokeSession = async (
  userId: string,
  sessionId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getUsersRevokeSessionUrl(userId, sessionId), {
    ...options,
    method: 'DELETE',
  })
}

export const getUsersRevokeSessionMutationKey = () => ['usersRevokeSession'] as const

export const getUsersRevokeSessionMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersRevokeSession>>,
    TError,
    UsersRevokeSessionMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersRevokeSession>>,
  TError,
  UsersRevokeSessionMutationVariables,
  TContext
> => {
  const mutationKey = getUsersRevokeSessionMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersRevokeSession>>,
    UsersRevokeSessionMutationVariables
  > = (props) => {
    const { userId, sessionId } = props ?? {}

    return usersRevokeSession(userId, sessionId, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersRevokeSessionMutationResult = NonNullable<Awaited<ReturnType<typeof usersRevokeSession>>>

export type UsersRevokeSessionMutationError = unknown
export type UsersRevokeSessionMutationVariables = { userId: string; sessionId: string }

export const useUsersRevokeSession = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersRevokeSession>>,
      TError,
      UsersRevokeSessionMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersRevokeSession>>,
  TError,
  UsersRevokeSessionMutationVariables,
  TContext
> => {
  return useMutation(getUsersRevokeSessionMutationOptions(options), queryClient)
}
export const getUsersGetAuditUrl = (userId: string, params?: UsersGetAuditParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/users/${userId}/audit?${stringifiedParams}`
    : `/api/users/${userId}/audit`
}

export const usersGetAudit = async (
  userId: string,
  params?: UsersGetAuditParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<UserAuditEntryDto[]> => {
  return apiFetch<UserAuditEntryDto[]>(getUsersGetAuditUrl(userId, params), {
    ...options,
    method: 'GET',
  })
}

export const getUsersGetAuditQueryKey = (userId: string, params?: UsersGetAuditParams) => {
  return [`/api/users/${userId}/audit`, ...(params ? [params] : [])] as const
}

export const getUsersGetAuditQueryOptions = <
  TData = Awaited<ReturnType<typeof usersGetAudit>>,
  TError = unknown,
>(
  userId: string,
  params?: UsersGetAuditParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetAudit>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getUsersGetAuditQueryKey(userId, params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof usersGetAudit>>> = ({ signal }) =>
    usersGetAudit(userId, params, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: userId !== null && userId !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof usersGetAudit>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type UsersGetAuditQueryResult = NonNullable<Awaited<ReturnType<typeof usersGetAudit>>>
export type UsersGetAuditQueryError = unknown

export function useUsersGetAudit<TData = Awaited<ReturnType<typeof usersGetAudit>>, TError = unknown>(
  userId: string,
  params: undefined | UsersGetAuditParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetAudit>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersGetAudit>>,
          TError,
          Awaited<ReturnType<typeof usersGetAudit>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersGetAudit<TData = Awaited<ReturnType<typeof usersGetAudit>>, TError = unknown>(
  userId: string,
  params?: UsersGetAuditParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetAudit>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersGetAudit>>,
          TError,
          Awaited<ReturnType<typeof usersGetAudit>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersGetAudit<TData = Awaited<ReturnType<typeof usersGetAudit>>, TError = unknown>(
  userId: string,
  params?: UsersGetAuditParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetAudit>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersGetAudit<TData = Awaited<ReturnType<typeof usersGetAudit>>, TError = unknown>(
  userId: string,
  params?: UsersGetAuditParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetAudit>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getUsersGetAuditQueryOptions(userId, params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getUsersUpdateUrl = (userId: string) => {
  return `/api/users/${userId}`
}

export const usersUpdate = async (
  userId: string,
  updateUserRequest: UpdateUserRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<UserListItemDto> => {
  return apiFetch<UserListItemDto>(getUsersUpdateUrl(userId), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateUserRequest),
  })
}

export const getUsersUpdateMutationKey = () => ['usersUpdate'] as const

export const getUsersUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersUpdate>>,
    TError,
    UsersUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersUpdate>>,
  TError,
  UsersUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getUsersUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersUpdate>>,
    UsersUpdateMutationVariables
  > = (props) => {
    const { userId, data } = props ?? {}

    return usersUpdate(userId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof usersUpdate>>>
export type UsersUpdateMutationBody = UpdateUserRequest
export type UsersUpdateMutationError = unknown
export type UsersUpdateMutationVariables = { userId: string; data: UpdateUserRequest }

export const useUsersUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersUpdate>>,
      TError,
      UsersUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersUpdate>>,
  TError,
  UsersUpdateMutationVariables,
  TContext
> => {
  return useMutation(getUsersUpdateMutationOptions(options), queryClient)
}
export const getUsersSetRolesUrl = (userId: string) => {
  return `/api/users/${userId}/roles`
}

export const usersSetRoles = async (
  userId: string,
  setUserRolesRequest: SetUserRolesRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getUsersSetRolesUrl(userId), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(setUserRolesRequest),
  })
}

export const getUsersSetRolesMutationKey = () => ['usersSetRoles'] as const

export const getUsersSetRolesMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersSetRoles>>,
    TError,
    UsersSetRolesMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersSetRoles>>,
  TError,
  UsersSetRolesMutationVariables,
  TContext
> => {
  const mutationKey = getUsersSetRolesMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersSetRoles>>,
    UsersSetRolesMutationVariables
  > = (props) => {
    const { userId, data } = props ?? {}

    return usersSetRoles(userId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersSetRolesMutationResult = NonNullable<Awaited<ReturnType<typeof usersSetRoles>>>
export type UsersSetRolesMutationBody = SetUserRolesRequest
export type UsersSetRolesMutationError = unknown
export type UsersSetRolesMutationVariables = { userId: string; data: SetUserRolesRequest }

export const useUsersSetRoles = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersSetRoles>>,
      TError,
      UsersSetRolesMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersSetRoles>>,
  TError,
  UsersSetRolesMutationVariables,
  TContext
> => {
  return useMutation(getUsersSetRolesMutationOptions(options), queryClient)
}
export const getUsersGetPermissionOverridesUrl = (userId: string) => {
  return `/api/users/${userId}/permission-overrides`
}

export const usersGetPermissionOverrides = async (
  userId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<PermissionOverrideDto[]> => {
  return apiFetch<PermissionOverrideDto[]>(getUsersGetPermissionOverridesUrl(userId), {
    ...options,
    method: 'GET',
  })
}

export const getUsersGetPermissionOverridesQueryKey = (userId: string) => {
  return [`/api/users/${userId}/permission-overrides`] as const
}

export const getUsersGetPermissionOverridesQueryOptions = <
  TData = Awaited<ReturnType<typeof usersGetPermissionOverrides>>,
  TError = unknown,
>(
  userId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetPermissionOverrides>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getUsersGetPermissionOverridesQueryKey(userId)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof usersGetPermissionOverrides>>> = ({ signal }) =>
    usersGetPermissionOverrides(userId, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: userId !== null && userId !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof usersGetPermissionOverrides>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type UsersGetPermissionOverridesQueryResult = NonNullable<
  Awaited<ReturnType<typeof usersGetPermissionOverrides>>
>
export type UsersGetPermissionOverridesQueryError = unknown

export function useUsersGetPermissionOverrides<
  TData = Awaited<ReturnType<typeof usersGetPermissionOverrides>>,
  TError = unknown,
>(
  userId: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetPermissionOverrides>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersGetPermissionOverrides>>,
          TError,
          Awaited<ReturnType<typeof usersGetPermissionOverrides>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersGetPermissionOverrides<
  TData = Awaited<ReturnType<typeof usersGetPermissionOverrides>>,
  TError = unknown,
>(
  userId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetPermissionOverrides>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof usersGetPermissionOverrides>>,
          TError,
          Awaited<ReturnType<typeof usersGetPermissionOverrides>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersGetPermissionOverrides<
  TData = Awaited<ReturnType<typeof usersGetPermissionOverrides>>,
  TError = unknown,
>(
  userId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetPermissionOverrides>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersGetPermissionOverrides<
  TData = Awaited<ReturnType<typeof usersGetPermissionOverrides>>,
  TError = unknown,
>(
  userId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersGetPermissionOverrides>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getUsersGetPermissionOverridesQueryOptions(userId, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getUsersSetPermissionOverridesUrl = (userId: string) => {
  return `/api/users/${userId}/permission-overrides`
}

export const usersSetPermissionOverrides = async (
  userId: string,
  setPermissionOverridesRequest: SetPermissionOverridesRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getUsersSetPermissionOverridesUrl(userId), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(setPermissionOverridesRequest),
  })
}

export const getUsersSetPermissionOverridesMutationKey = () => ['usersSetPermissionOverrides'] as const

export const getUsersSetPermissionOverridesMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof usersSetPermissionOverrides>>,
    TError,
    UsersSetPermissionOverridesMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof usersSetPermissionOverrides>>,
  TError,
  UsersSetPermissionOverridesMutationVariables,
  TContext
> => {
  const mutationKey = getUsersSetPermissionOverridesMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof usersSetPermissionOverrides>>,
    UsersSetPermissionOverridesMutationVariables
  > = (props) => {
    const { userId, data } = props ?? {}

    return usersSetPermissionOverrides(userId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type UsersSetPermissionOverridesMutationResult = NonNullable<
  Awaited<ReturnType<typeof usersSetPermissionOverrides>>
>
export type UsersSetPermissionOverridesMutationBody = SetPermissionOverridesRequest
export type UsersSetPermissionOverridesMutationError = unknown
export type UsersSetPermissionOverridesMutationVariables = {
  userId: string
  data: SetPermissionOverridesRequest
}

export const useUsersSetPermissionOverrides = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof usersSetPermissionOverrides>>,
      TError,
      UsersSetPermissionOverridesMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof usersSetPermissionOverrides>>,
  TError,
  UsersSetPermissionOverridesMutationVariables,
  TContext
> => {
  return useMutation(getUsersSetPermissionOverridesMutationOptions(options), queryClient)
}
