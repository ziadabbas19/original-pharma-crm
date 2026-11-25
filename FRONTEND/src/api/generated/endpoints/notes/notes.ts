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
  CreateNoteRequest,
  NoteDto,
  NotesListParams,
  SnoozeNoteRequest,
  UpdateNoteRequest,
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

export const getNotesListUrl = (params?: NotesListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/notes?${stringifiedParams}` : `/api/notes`
}

export const notesList = async (
  params?: NotesListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<NoteDto[]> => {
  return apiFetch<NoteDto[]>(getNotesListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getNotesListQueryKey = (params?: NotesListParams) => {
  return [`/api/notes`, ...(params ? [params] : [])] as const
}

export const getNotesListQueryOptions = <TData = Awaited<ReturnType<typeof notesList>>, TError = unknown>(
  params?: NotesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getNotesListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof notesList>>> = ({ signal }) =>
    notesList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof notesList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type NotesListQueryResult = NonNullable<Awaited<ReturnType<typeof notesList>>>
export type NotesListQueryError = unknown

export function useNotesList<TData = Awaited<ReturnType<typeof notesList>>, TError = unknown>(
  params: undefined | NotesListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof notesList>>,
          TError,
          Awaited<ReturnType<typeof notesList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotesList<TData = Awaited<ReturnType<typeof notesList>>, TError = unknown>(
  params?: NotesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof notesList>>,
          TError,
          Awaited<ReturnType<typeof notesList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotesList<TData = Awaited<ReturnType<typeof notesList>>, TError = unknown>(
  params?: NotesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotesList<TData = Awaited<ReturnType<typeof notesList>>, TError = unknown>(
  params?: NotesListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getNotesListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getNotesCreateUrl = () => {
  return `/api/notes`
}

export const notesCreate = async (
  createNoteRequest: CreateNoteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<NoteDto> => {
  return apiFetch<NoteDto>(getNotesCreateUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createNoteRequest),
  })
}

export const getNotesCreateMutationKey = () => ['notesCreate'] as const

export const getNotesCreateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof notesCreate>>,
    TError,
    NotesCreateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof notesCreate>>,
  TError,
  NotesCreateMutationVariables,
  TContext
> => {
  const mutationKey = getNotesCreateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof notesCreate>>,
    NotesCreateMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return notesCreate(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotesCreateMutationResult = NonNullable<Awaited<ReturnType<typeof notesCreate>>>
export type NotesCreateMutationBody = CreateNoteRequest
export type NotesCreateMutationError = unknown
export type NotesCreateMutationVariables = { data: CreateNoteRequest }

export const useNotesCreate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notesCreate>>,
      TError,
      NotesCreateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof notesCreate>>,
  TError,
  NotesCreateMutationVariables,
  TContext
> => {
  return useMutation(getNotesCreateMutationOptions(options), queryClient)
}
export const getNotesGetUrl = (id: string) => {
  return `/api/notes/${id}`
}

export const notesGet = async (id: string, options?: Parameters<typeof apiFetch>[1]): Promise<NoteDto> => {
  return apiFetch<NoteDto>(getNotesGetUrl(id), {
    ...options,
    method: 'GET',
  })
}

export const getNotesGetQueryKey = (id: string) => {
  return [`/api/notes/${id}`] as const
}

export const getNotesGetQueryOptions = <TData = Awaited<ReturnType<typeof notesGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getNotesGetQueryKey(id)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof notesGet>>> = ({ signal }) =>
    notesGet(id, { signal, ...requestOptions })

  return { queryKey, queryFn, enabled: id !== null && id !== undefined, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof notesGet>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type NotesGetQueryResult = NonNullable<Awaited<ReturnType<typeof notesGet>>>
export type NotesGetQueryError = unknown

export function useNotesGet<TData = Awaited<ReturnType<typeof notesGet>>, TError = unknown>(
  id: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesGet>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof notesGet>>,
          TError,
          Awaited<ReturnType<typeof notesGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotesGet<TData = Awaited<ReturnType<typeof notesGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesGet>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof notesGet>>,
          TError,
          Awaited<ReturnType<typeof notesGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotesGet<TData = Awaited<ReturnType<typeof notesGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useNotesGet<TData = Awaited<ReturnType<typeof notesGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof notesGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getNotesGetQueryOptions(id, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getNotesUpdateUrl = (id: string) => {
  return `/api/notes/${id}`
}

export const notesUpdate = async (
  id: string,
  updateNoteRequest: UpdateNoteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<NoteDto> => {
  return apiFetch<NoteDto>(getNotesUpdateUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateNoteRequest),
  })
}

export const getNotesUpdateMutationKey = () => ['notesUpdate'] as const

export const getNotesUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof notesUpdate>>,
    TError,
    NotesUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof notesUpdate>>,
  TError,
  NotesUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getNotesUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof notesUpdate>>,
    NotesUpdateMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return notesUpdate(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotesUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof notesUpdate>>>
export type NotesUpdateMutationBody = UpdateNoteRequest
export type NotesUpdateMutationError = unknown
export type NotesUpdateMutationVariables = { id: string; data: UpdateNoteRequest }

export const useNotesUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notesUpdate>>,
      TError,
      NotesUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof notesUpdate>>,
  TError,
  NotesUpdateMutationVariables,
  TContext
> => {
  return useMutation(getNotesUpdateMutationOptions(options), queryClient)
}
export const getNotesDeleteUrl = (id: string) => {
  return `/api/notes/${id}`
}

export const notesDelete = async (id: string, options?: Parameters<typeof apiFetch>[1]): Promise<void> => {
  return apiFetch<void>(getNotesDeleteUrl(id), {
    ...options,
    method: 'DELETE',
  })
}

export const getNotesDeleteMutationKey = () => ['notesDelete'] as const

export const getNotesDeleteMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof notesDelete>>,
    TError,
    NotesDeleteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof notesDelete>>,
  TError,
  NotesDeleteMutationVariables,
  TContext
> => {
  const mutationKey = getNotesDeleteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof notesDelete>>,
    NotesDeleteMutationVariables
  > = (props) => {
    const { id } = props ?? {}

    return notesDelete(id, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotesDeleteMutationResult = NonNullable<Awaited<ReturnType<typeof notesDelete>>>

export type NotesDeleteMutationError = unknown
export type NotesDeleteMutationVariables = { id: string }

export const useNotesDelete = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notesDelete>>,
      TError,
      NotesDeleteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof notesDelete>>,
  TError,
  NotesDeleteMutationVariables,
  TContext
> => {
  return useMutation(getNotesDeleteMutationOptions(options), queryClient)
}
export const getNotesDoneUrl = (id: string) => {
  return `/api/notes/${id}/done`
}

export const notesDone = async (id: string, options?: Parameters<typeof apiFetch>[1]): Promise<NoteDto> => {
  return apiFetch<NoteDto>(getNotesDoneUrl(id), {
    ...options,
    method: 'POST',
  })
}

export const getNotesDoneMutationKey = () => ['notesDone'] as const

export const getNotesDoneMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof notesDone>>,
    TError,
    NotesDoneMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof notesDone>>,
  TError,
  NotesDoneMutationVariables,
  TContext
> => {
  const mutationKey = getNotesDoneMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<Awaited<ReturnType<typeof notesDone>>, NotesDoneMutationVariables> = (
    props,
  ) => {
    const { id } = props ?? {}

    return notesDone(id, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotesDoneMutationResult = NonNullable<Awaited<ReturnType<typeof notesDone>>>

export type NotesDoneMutationError = unknown
export type NotesDoneMutationVariables = { id: string }

export const useNotesDone = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notesDone>>,
      TError,
      NotesDoneMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<Awaited<ReturnType<typeof notesDone>>, TError, NotesDoneMutationVariables, TContext> => {
  return useMutation(getNotesDoneMutationOptions(options), queryClient)
}
export const getNotesReopenUrl = (id: string) => {
  return `/api/notes/${id}/reopen`
}

export const notesReopen = async (id: string, options?: Parameters<typeof apiFetch>[1]): Promise<NoteDto> => {
  return apiFetch<NoteDto>(getNotesReopenUrl(id), {
    ...options,
    method: 'POST',
  })
}

export const getNotesReopenMutationKey = () => ['notesReopen'] as const

export const getNotesReopenMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof notesReopen>>,
    TError,
    NotesReopenMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof notesReopen>>,
  TError,
  NotesReopenMutationVariables,
  TContext
> => {
  const mutationKey = getNotesReopenMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof notesReopen>>,
    NotesReopenMutationVariables
  > = (props) => {
    const { id } = props ?? {}

    return notesReopen(id, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotesReopenMutationResult = NonNullable<Awaited<ReturnType<typeof notesReopen>>>

export type NotesReopenMutationError = unknown
export type NotesReopenMutationVariables = { id: string }

export const useNotesReopen = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notesReopen>>,
      TError,
      NotesReopenMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof notesReopen>>,
  TError,
  NotesReopenMutationVariables,
  TContext
> => {
  return useMutation(getNotesReopenMutationOptions(options), queryClient)
}
export const getNotesSnoozeUrl = (id: string) => {
  return `/api/notes/${id}/snooze`
}

export const notesSnooze = async (
  id: string,
  snoozeNoteRequest: SnoozeNoteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<NoteDto> => {
  return apiFetch<NoteDto>(getNotesSnoozeUrl(id), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(snoozeNoteRequest),
  })
}

export const getNotesSnoozeMutationKey = () => ['notesSnooze'] as const

export const getNotesSnoozeMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof notesSnooze>>,
    TError,
    NotesSnoozeMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof notesSnooze>>,
  TError,
  NotesSnoozeMutationVariables,
  TContext
> => {
  const mutationKey = getNotesSnoozeMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof notesSnooze>>,
    NotesSnoozeMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return notesSnooze(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type NotesSnoozeMutationResult = NonNullable<Awaited<ReturnType<typeof notesSnooze>>>
export type NotesSnoozeMutationBody = SnoozeNoteRequest
export type NotesSnoozeMutationError = unknown
export type NotesSnoozeMutationVariables = { id: string; data: SnoozeNoteRequest }

export const useNotesSnooze = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof notesSnooze>>,
      TError,
      NotesSnoozeMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof notesSnooze>>,
  TError,
  NotesSnoozeMutationVariables,
  TContext
> => {
  return useMutation(getNotesSnoozeMutationOptions(options), queryClient)
}
