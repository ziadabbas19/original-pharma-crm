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
  CreateRoleRequest,
  PermissionDto,
  ProblemDetails,
  ReassignRoleUsersRequest,
  ReassignRoleUsersResult,
  RoleAuditEntryDto,
  RoleDto,
  RolesGetAuditParams,
  SetRolePermissionsRequest,
  UpdateRoleRequest,
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

export const getRolesListUrl = () => {
  return `/api/roles`
}

export const rolesList = async (options?: Parameters<typeof apiFetch>[1]): Promise<RoleDto[]> => {
  return apiFetch<RoleDto[]>(getRolesListUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getRolesListQueryKey = () => {
  return [`/api/roles`] as const
}

export const getRolesListQueryOptions = <
  TData = Awaited<ReturnType<typeof rolesList>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesList>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getRolesListQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof rolesList>>> = ({ signal }) =>
    rolesList({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof rolesList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type RolesListQueryResult = NonNullable<Awaited<ReturnType<typeof rolesList>>>
export type RolesListQueryError = unknown

export function useRolesList<TData = Awaited<ReturnType<typeof rolesList>>, TError = unknown>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof rolesList>>,
          TError,
          Awaited<ReturnType<typeof rolesList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesList<TData = Awaited<ReturnType<typeof rolesList>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof rolesList>>,
          TError,
          Awaited<ReturnType<typeof rolesList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesList<TData = Awaited<ReturnType<typeof rolesList>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesList<TData = Awaited<ReturnType<typeof rolesList>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getRolesListQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getRolesCreateUrl = () => {
  return `/api/roles`
}

export const rolesCreate = async (
  createRoleRequest: CreateRoleRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RoleDto> => {
  return apiFetch<RoleDto>(getRolesCreateUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createRoleRequest),
  })
}

export const getRolesCreateMutationKey = () => ['rolesCreate'] as const

export const getRolesCreateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof rolesCreate>>,
    TError,
    RolesCreateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof rolesCreate>>,
  TError,
  RolesCreateMutationVariables,
  TContext
> => {
  const mutationKey = getRolesCreateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof rolesCreate>>,
    RolesCreateMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return rolesCreate(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RolesCreateMutationResult = NonNullable<Awaited<ReturnType<typeof rolesCreate>>>
export type RolesCreateMutationBody = CreateRoleRequest
export type RolesCreateMutationError = unknown
export type RolesCreateMutationVariables = { data: CreateRoleRequest }

export const useRolesCreate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof rolesCreate>>,
      TError,
      RolesCreateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof rolesCreate>>,
  TError,
  RolesCreateMutationVariables,
  TContext
> => {
  return useMutation(getRolesCreateMutationOptions(options), queryClient)
}
export const getRolesListPermissionsUrl = () => {
  return `/api/permissions`
}

export const rolesListPermissions = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<PermissionDto[]> => {
  return apiFetch<PermissionDto[]>(getRolesListPermissionsUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getRolesListPermissionsQueryKey = () => {
  return [`/api/permissions`] as const
}

export const getRolesListPermissionsQueryOptions = <
  TData = Awaited<ReturnType<typeof rolesListPermissions>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesListPermissions>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getRolesListPermissionsQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof rolesListPermissions>>> = ({ signal }) =>
    rolesListPermissions({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof rolesListPermissions>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type RolesListPermissionsQueryResult = NonNullable<Awaited<ReturnType<typeof rolesListPermissions>>>
export type RolesListPermissionsQueryError = unknown

export function useRolesListPermissions<
  TData = Awaited<ReturnType<typeof rolesListPermissions>>,
  TError = unknown,
>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesListPermissions>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof rolesListPermissions>>,
          TError,
          Awaited<ReturnType<typeof rolesListPermissions>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesListPermissions<
  TData = Awaited<ReturnType<typeof rolesListPermissions>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesListPermissions>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof rolesListPermissions>>,
          TError,
          Awaited<ReturnType<typeof rolesListPermissions>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesListPermissions<
  TData = Awaited<ReturnType<typeof rolesListPermissions>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesListPermissions>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesListPermissions<
  TData = Awaited<ReturnType<typeof rolesListPermissions>>,
  TError = unknown,
>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesListPermissions>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getRolesListPermissionsQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getRolesUpdateUrl = (roleId: string) => {
  return `/api/roles/${roleId}`
}

export const rolesUpdate = async (
  roleId: string,
  updateRoleRequest: UpdateRoleRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RoleDto> => {
  return apiFetch<RoleDto>(getRolesUpdateUrl(roleId), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateRoleRequest),
  })
}

export const getRolesUpdateMutationKey = () => ['rolesUpdate'] as const

export const getRolesUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof rolesUpdate>>,
    TError,
    RolesUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof rolesUpdate>>,
  TError,
  RolesUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getRolesUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof rolesUpdate>>,
    RolesUpdateMutationVariables
  > = (props) => {
    const { roleId, data } = props ?? {}

    return rolesUpdate(roleId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RolesUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof rolesUpdate>>>
export type RolesUpdateMutationBody = UpdateRoleRequest
export type RolesUpdateMutationError = unknown
export type RolesUpdateMutationVariables = { roleId: string; data: UpdateRoleRequest }

export const useRolesUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof rolesUpdate>>,
      TError,
      RolesUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof rolesUpdate>>,
  TError,
  RolesUpdateMutationVariables,
  TContext
> => {
  return useMutation(getRolesUpdateMutationOptions(options), queryClient)
}
export const getRolesDeleteUrl = (roleId: string) => {
  return `/api/roles/${roleId}`
}

export const rolesDelete = async (
  roleId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getRolesDeleteUrl(roleId), {
    ...options,
    method: 'DELETE',
  })
}

export const getRolesDeleteMutationKey = () => ['rolesDelete'] as const

export const getRolesDeleteMutationOptions = <TError = ProblemDetails, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof rolesDelete>>,
    TError,
    RolesDeleteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof rolesDelete>>,
  TError,
  RolesDeleteMutationVariables,
  TContext
> => {
  const mutationKey = getRolesDeleteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof rolesDelete>>,
    RolesDeleteMutationVariables
  > = (props) => {
    const { roleId } = props ?? {}

    return rolesDelete(roleId, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RolesDeleteMutationResult = NonNullable<Awaited<ReturnType<typeof rolesDelete>>>

export type RolesDeleteMutationError = ProblemDetails
export type RolesDeleteMutationVariables = { roleId: string }

export const useRolesDelete = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof rolesDelete>>,
      TError,
      RolesDeleteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof rolesDelete>>,
  TError,
  RolesDeleteMutationVariables,
  TContext
> => {
  return useMutation(getRolesDeleteMutationOptions(options), queryClient)
}
export const getRolesSetPermissionsUrl = (roleId: string) => {
  return `/api/roles/${roleId}/permissions`
}

export const rolesSetPermissions = async (
  roleId: string,
  setRolePermissionsRequest: SetRolePermissionsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RoleDto> => {
  return apiFetch<RoleDto>(getRolesSetPermissionsUrl(roleId), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(setRolePermissionsRequest),
  })
}

export const getRolesSetPermissionsMutationKey = () => ['rolesSetPermissions'] as const

export const getRolesSetPermissionsMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof rolesSetPermissions>>,
    TError,
    RolesSetPermissionsMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof rolesSetPermissions>>,
  TError,
  RolesSetPermissionsMutationVariables,
  TContext
> => {
  const mutationKey = getRolesSetPermissionsMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof rolesSetPermissions>>,
    RolesSetPermissionsMutationVariables
  > = (props) => {
    const { roleId, data } = props ?? {}

    return rolesSetPermissions(roleId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RolesSetPermissionsMutationResult = NonNullable<Awaited<ReturnType<typeof rolesSetPermissions>>>
export type RolesSetPermissionsMutationBody = SetRolePermissionsRequest
export type RolesSetPermissionsMutationError = unknown
export type RolesSetPermissionsMutationVariables = { roleId: string; data: SetRolePermissionsRequest }

export const useRolesSetPermissions = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof rolesSetPermissions>>,
      TError,
      RolesSetPermissionsMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof rolesSetPermissions>>,
  TError,
  RolesSetPermissionsMutationVariables,
  TContext
> => {
  return useMutation(getRolesSetPermissionsMutationOptions(options), queryClient)
}
export const getRolesReassignUsersUrl = (roleId: string) => {
  return `/api/roles/${roleId}/reassign`
}

export const rolesReassignUsers = async (
  roleId: string,
  reassignRoleUsersRequest: ReassignRoleUsersRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ReassignRoleUsersResult> => {
  return apiFetch<ReassignRoleUsersResult>(getRolesReassignUsersUrl(roleId), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(reassignRoleUsersRequest),
  })
}

export const getRolesReassignUsersMutationKey = () => ['rolesReassignUsers'] as const

export const getRolesReassignUsersMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof rolesReassignUsers>>,
    TError,
    RolesReassignUsersMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof rolesReassignUsers>>,
  TError,
  RolesReassignUsersMutationVariables,
  TContext
> => {
  const mutationKey = getRolesReassignUsersMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof rolesReassignUsers>>,
    RolesReassignUsersMutationVariables
  > = (props) => {
    const { roleId, data } = props ?? {}

    return rolesReassignUsers(roleId, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type RolesReassignUsersMutationResult = NonNullable<Awaited<ReturnType<typeof rolesReassignUsers>>>
export type RolesReassignUsersMutationBody = ReassignRoleUsersRequest
export type RolesReassignUsersMutationError = unknown
export type RolesReassignUsersMutationVariables = { roleId: string; data: ReassignRoleUsersRequest }

export const useRolesReassignUsers = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof rolesReassignUsers>>,
      TError,
      RolesReassignUsersMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof rolesReassignUsers>>,
  TError,
  RolesReassignUsersMutationVariables,
  TContext
> => {
  return useMutation(getRolesReassignUsersMutationOptions(options), queryClient)
}
export const getRolesGetAuditUrl = (roleId: string, params?: RolesGetAuditParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/roles/${roleId}/audit?${stringifiedParams}`
    : `/api/roles/${roleId}/audit`
}

export const rolesGetAudit = async (
  roleId: string,
  params?: RolesGetAuditParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<RoleAuditEntryDto[]> => {
  return apiFetch<RoleAuditEntryDto[]>(getRolesGetAuditUrl(roleId, params), {
    ...options,
    method: 'GET',
  })
}

export const getRolesGetAuditQueryKey = (roleId: string, params?: RolesGetAuditParams) => {
  return [`/api/roles/${roleId}/audit`, ...(params ? [params] : [])] as const
}

export const getRolesGetAuditQueryOptions = <
  TData = Awaited<ReturnType<typeof rolesGetAudit>>,
  TError = unknown,
>(
  roleId: string,
  params?: RolesGetAuditParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesGetAudit>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getRolesGetAuditQueryKey(roleId, params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof rolesGetAudit>>> = ({ signal }) =>
    rolesGetAudit(roleId, params, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: roleId !== null && roleId !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof rolesGetAudit>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type RolesGetAuditQueryResult = NonNullable<Awaited<ReturnType<typeof rolesGetAudit>>>
export type RolesGetAuditQueryError = unknown

export function useRolesGetAudit<TData = Awaited<ReturnType<typeof rolesGetAudit>>, TError = unknown>(
  roleId: string,
  params: undefined | RolesGetAuditParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesGetAudit>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof rolesGetAudit>>,
          TError,
          Awaited<ReturnType<typeof rolesGetAudit>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesGetAudit<TData = Awaited<ReturnType<typeof rolesGetAudit>>, TError = unknown>(
  roleId: string,
  params?: RolesGetAuditParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesGetAudit>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof rolesGetAudit>>,
          TError,
          Awaited<ReturnType<typeof rolesGetAudit>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesGetAudit<TData = Awaited<ReturnType<typeof rolesGetAudit>>, TError = unknown>(
  roleId: string,
  params?: RolesGetAuditParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesGetAudit>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useRolesGetAudit<TData = Awaited<ReturnType<typeof rolesGetAudit>>, TError = unknown>(
  roleId: string,
  params?: RolesGetAuditParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof rolesGetAudit>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getRolesGetAuditQueryOptions(roleId, params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
