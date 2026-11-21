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
  AccountSetAvatarBody,
  AvatarDto,
  ChangePasswordRequest,
  ProblemDetails,
  UserSessionDto,
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

export const getAccountChangePasswordUrl = () => {
  return `/api/account/password`
}

export const accountChangePassword = async (
  changePasswordRequest: ChangePasswordRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getAccountChangePasswordUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(changePasswordRequest),
  })
}

export const getAccountChangePasswordMutationKey = () => ['accountChangePassword'] as const

export const getAccountChangePasswordMutationOptions = <
  TError = ProblemDetails,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof accountChangePassword>>,
    TError,
    AccountChangePasswordMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof accountChangePassword>>,
  TError,
  AccountChangePasswordMutationVariables,
  TContext
> => {
  const mutationKey = getAccountChangePasswordMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof accountChangePassword>>,
    AccountChangePasswordMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return accountChangePassword(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type AccountChangePasswordMutationResult = NonNullable<
  Awaited<ReturnType<typeof accountChangePassword>>
>
export type AccountChangePasswordMutationBody = ChangePasswordRequest
export type AccountChangePasswordMutationError = ProblemDetails
export type AccountChangePasswordMutationVariables = { data: ChangePasswordRequest }

export const useAccountChangePassword = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof accountChangePassword>>,
      TError,
      AccountChangePasswordMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof accountChangePassword>>,
  TError,
  AccountChangePasswordMutationVariables,
  TContext
> => {
  return useMutation(getAccountChangePasswordMutationOptions(options), queryClient)
}
export const getAccountSetAvatarUrl = () => {
  return `/api/account/avatar`
}

export const accountSetAvatar = async (
  accountSetAvatarBody: AccountSetAvatarBody,
  options?: Parameters<typeof apiFetch>[1],
): Promise<AvatarDto> => {
  const formData = new FormData()
  if (accountSetAvatarBody.file !== undefined) {
    formData.append(`file`, accountSetAvatarBody.file)
  }

  return apiFetch<AvatarDto>(getAccountSetAvatarUrl(), {
    ...options,
    method: 'PUT',
    body: formData,
  })
}

export const getAccountSetAvatarMutationKey = () => ['accountSetAvatar'] as const

export const getAccountSetAvatarMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof accountSetAvatar>>,
    TError,
    AccountSetAvatarMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof accountSetAvatar>>,
  TError,
  AccountSetAvatarMutationVariables,
  TContext
> => {
  const mutationKey = getAccountSetAvatarMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof accountSetAvatar>>,
    AccountSetAvatarMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return accountSetAvatar(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type AccountSetAvatarMutationResult = NonNullable<Awaited<ReturnType<typeof accountSetAvatar>>>
export type AccountSetAvatarMutationBody = AccountSetAvatarBody
export type AccountSetAvatarMutationError = unknown
export type AccountSetAvatarMutationVariables = { data: AccountSetAvatarBody }

export const useAccountSetAvatar = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof accountSetAvatar>>,
      TError,
      AccountSetAvatarMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof accountSetAvatar>>,
  TError,
  AccountSetAvatarMutationVariables,
  TContext
> => {
  return useMutation(getAccountSetAvatarMutationOptions(options), queryClient)
}
export const getAccountRemoveAvatarUrl = () => {
  return `/api/account/avatar`
}

export const accountRemoveAvatar = async (options?: Parameters<typeof apiFetch>[1]): Promise<void> => {
  return apiFetch<void>(getAccountRemoveAvatarUrl(), {
    ...options,
    method: 'DELETE',
  })
}

export const getAccountRemoveAvatarMutationKey = () => ['accountRemoveAvatar'] as const

export const getAccountRemoveAvatarMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<Awaited<ReturnType<typeof accountRemoveAvatar>>, TError, void, TContext>
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<Awaited<ReturnType<typeof accountRemoveAvatar>>, TError, void, TContext> => {
  const mutationKey = getAccountRemoveAvatarMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<Awaited<ReturnType<typeof accountRemoveAvatar>>, void> = () => {
    return accountRemoveAvatar(requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type AccountRemoveAvatarMutationResult = NonNullable<Awaited<ReturnType<typeof accountRemoveAvatar>>>

export type AccountRemoveAvatarMutationError = unknown

export const useAccountRemoveAvatar = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof accountRemoveAvatar>>, TError, void, TContext>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<Awaited<ReturnType<typeof accountRemoveAvatar>>, TError, void, TContext> => {
  return useMutation(getAccountRemoveAvatarMutationOptions(options), queryClient)
}
export const getAccountListSessionsUrl = () => {
  return `/api/account/sessions`
}

export const accountListSessions = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<UserSessionDto[]> => {
  return apiFetch<UserSessionDto[]>(getAccountListSessionsUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getAccountListSessionsQueryKey = () => {
  return [`/api/account/sessions`] as const
}

export const getAccountListSessionsQueryOptions = <
  TData = Awaited<ReturnType<typeof accountListSessions>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof accountListSessions>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getAccountListSessionsQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof accountListSessions>>> = ({ signal }) =>
    accountListSessions({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof accountListSessions>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type AccountListSessionsQueryResult = NonNullable<Awaited<ReturnType<typeof accountListSessions>>>
export type AccountListSessionsQueryError = unknown

export function useAccountListSessions<
  TData = Awaited<ReturnType<typeof accountListSessions>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof accountListSessions>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof accountListSessions>>,
          TError,
          Awaited<ReturnType<typeof accountListSessions>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useAccountListSessions<
  TData = Awaited<ReturnType<typeof accountListSessions>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof accountListSessions>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof accountListSessions>>,
          TError,
          Awaited<ReturnType<typeof accountListSessions>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useAccountListSessions<
  TData = Awaited<ReturnType<typeof accountListSessions>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof accountListSessions>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useAccountListSessions<
  TData = Awaited<ReturnType<typeof accountListSessions>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof accountListSessions>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getAccountListSessionsQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getAccountRevokeSessionUrl = (sessionId: string) => {
  return `/api/account/sessions/${sessionId}`
}

export const accountRevokeSession = async (
  sessionId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getAccountRevokeSessionUrl(sessionId), {
    ...options,
    method: 'DELETE',
  })
}

export const getAccountRevokeSessionMutationKey = () => ['accountRevokeSession'] as const

export const getAccountRevokeSessionMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof accountRevokeSession>>,
    TError,
    AccountRevokeSessionMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof accountRevokeSession>>,
  TError,
  AccountRevokeSessionMutationVariables,
  TContext
> => {
  const mutationKey = getAccountRevokeSessionMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof accountRevokeSession>>,
    AccountRevokeSessionMutationVariables
  > = (props) => {
    const { sessionId } = props ?? {}

    return accountRevokeSession(sessionId, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type AccountRevokeSessionMutationResult = NonNullable<Awaited<ReturnType<typeof accountRevokeSession>>>

export type AccountRevokeSessionMutationError = unknown
export type AccountRevokeSessionMutationVariables = { sessionId: string }

export const useAccountRevokeSession = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof accountRevokeSession>>,
      TError,
      AccountRevokeSessionMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof accountRevokeSession>>,
  TError,
  AccountRevokeSessionMutationVariables,
  TContext
> => {
  return useMutation(getAccountRevokeSessionMutationOptions(options), queryClient)
}
