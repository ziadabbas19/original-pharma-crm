/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import { useMutation } from '@tanstack/react-query'
import type {
  MutationFunction,
  QueryClient,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query'

import type { AccountSetAvatarBody, AvatarDto, ChangePasswordRequest, ProblemDetails } from '../../model'

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
