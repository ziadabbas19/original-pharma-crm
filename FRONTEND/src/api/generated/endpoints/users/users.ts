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
  CreateUserRequest,
  PermissionOverrideDto,
  SetPermissionOverridesRequest,
  SetUserRolesRequest,
  UpdateUserRequest,
  UserListItemDto,
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

export const getUsersListUrl = () => {
  return `/api/users`
}

export const usersList = async (options?: Parameters<typeof apiFetch>[1]): Promise<UserListItemDto[]> => {
  return apiFetch<UserListItemDto[]>(getUsersListUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getUsersListQueryKey = () => {
  return [`/api/users`] as const
}

export const getUsersListQueryOptions = <
  TData = Awaited<ReturnType<typeof usersList>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersList>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getUsersListQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof usersList>>> = ({ signal }) =>
    usersList({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof usersList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type UsersListQueryResult = NonNullable<Awaited<ReturnType<typeof usersList>>>
export type UsersListQueryError = unknown

export function useUsersList<TData = Awaited<ReturnType<typeof usersList>>, TError = unknown>(
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
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useUsersList<TData = Awaited<ReturnType<typeof usersList>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof usersList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getUsersListQueryOptions(options)

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
): Promise<UserListItemDto> => {
  return apiFetch<UserListItemDto>(getUsersCreateUrl(), {
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
