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
  CreateExpenseLineRequest,
  ExpenseDayDto,
  ExpenseLineDto,
  ExpenseMonthDto,
  ExpenseReportDto,
  ExpensesDayParams,
  ExpensesExportParams,
  ExpensesMonthParams,
  ExpensesMonthReportParams,
  ExpensesReportParams,
  ExpensesStatementParams,
  SetExpenseDayNoteRequest,
  Stream,
  UpdateExpenseLineRequest,
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

export const getExpensesDayUrl = (params?: ExpensesDayParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/expenses/day?${stringifiedParams}` : `/api/expenses/day`
}

export const expensesDay = async (
  params?: ExpensesDayParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ExpenseDayDto> => {
  return apiFetch<ExpenseDayDto>(getExpensesDayUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getExpensesDayQueryKey = (params?: ExpensesDayParams) => {
  return [`/api/expenses/day`, ...(params ? [params] : [])] as const
}

export const getExpensesDayQueryOptions = <TData = Awaited<ReturnType<typeof expensesDay>>, TError = unknown>(
  params?: ExpensesDayParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesDay>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getExpensesDayQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof expensesDay>>> = ({ signal }) =>
    expensesDay(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof expensesDay>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type ExpensesDayQueryResult = NonNullable<Awaited<ReturnType<typeof expensesDay>>>
export type ExpensesDayQueryError = unknown

export function useExpensesDay<TData = Awaited<ReturnType<typeof expensesDay>>, TError = unknown>(
  params: undefined | ExpensesDayParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesDay>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesDay>>,
          TError,
          Awaited<ReturnType<typeof expensesDay>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesDay<TData = Awaited<ReturnType<typeof expensesDay>>, TError = unknown>(
  params?: ExpensesDayParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesDay>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesDay>>,
          TError,
          Awaited<ReturnType<typeof expensesDay>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesDay<TData = Awaited<ReturnType<typeof expensesDay>>, TError = unknown>(
  params?: ExpensesDayParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesDay>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesDay<TData = Awaited<ReturnType<typeof expensesDay>>, TError = unknown>(
  params?: ExpensesDayParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesDay>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getExpensesDayQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getExpensesMonthUrl = (params?: ExpensesMonthParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/expenses/month?${stringifiedParams}` : `/api/expenses/month`
}

export const expensesMonth = async (
  params?: ExpensesMonthParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ExpenseMonthDto> => {
  return apiFetch<ExpenseMonthDto>(getExpensesMonthUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getExpensesMonthQueryKey = (params?: ExpensesMonthParams) => {
  return [`/api/expenses/month`, ...(params ? [params] : [])] as const
}

export const getExpensesMonthQueryOptions = <
  TData = Awaited<ReturnType<typeof expensesMonth>>,
  TError = unknown,
>(
  params?: ExpensesMonthParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonth>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getExpensesMonthQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof expensesMonth>>> = ({ signal }) =>
    expensesMonth(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof expensesMonth>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type ExpensesMonthQueryResult = NonNullable<Awaited<ReturnType<typeof expensesMonth>>>
export type ExpensesMonthQueryError = unknown

export function useExpensesMonth<TData = Awaited<ReturnType<typeof expensesMonth>>, TError = unknown>(
  params: undefined | ExpensesMonthParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonth>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesMonth>>,
          TError,
          Awaited<ReturnType<typeof expensesMonth>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesMonth<TData = Awaited<ReturnType<typeof expensesMonth>>, TError = unknown>(
  params?: ExpensesMonthParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonth>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesMonth>>,
          TError,
          Awaited<ReturnType<typeof expensesMonth>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesMonth<TData = Awaited<ReturnType<typeof expensesMonth>>, TError = unknown>(
  params?: ExpensesMonthParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonth>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesMonth<TData = Awaited<ReturnType<typeof expensesMonth>>, TError = unknown>(
  params?: ExpensesMonthParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonth>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getExpensesMonthQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getExpensesCreateLineUrl = () => {
  return `/api/expenses/lines`
}

export const expensesCreateLine = async (
  createExpenseLineRequest: CreateExpenseLineRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ExpenseLineDto> => {
  return apiFetch<ExpenseLineDto>(getExpensesCreateLineUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(createExpenseLineRequest),
  })
}

export const getExpensesCreateLineMutationKey = () => ['expensesCreateLine'] as const

export const getExpensesCreateLineMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof expensesCreateLine>>,
    TError,
    ExpensesCreateLineMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof expensesCreateLine>>,
  TError,
  ExpensesCreateLineMutationVariables,
  TContext
> => {
  const mutationKey = getExpensesCreateLineMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof expensesCreateLine>>,
    ExpensesCreateLineMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return expensesCreateLine(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ExpensesCreateLineMutationResult = NonNullable<Awaited<ReturnType<typeof expensesCreateLine>>>
export type ExpensesCreateLineMutationBody = CreateExpenseLineRequest
export type ExpensesCreateLineMutationError = unknown
export type ExpensesCreateLineMutationVariables = { data: CreateExpenseLineRequest }

export const useExpensesCreateLine = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof expensesCreateLine>>,
      TError,
      ExpensesCreateLineMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof expensesCreateLine>>,
  TError,
  ExpensesCreateLineMutationVariables,
  TContext
> => {
  return useMutation(getExpensesCreateLineMutationOptions(options), queryClient)
}
export const getExpensesUpdateLineUrl = (id: string) => {
  return `/api/expenses/lines/${id}`
}

export const expensesUpdateLine = async (
  id: string,
  updateExpenseLineRequest: UpdateExpenseLineRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ExpenseLineDto> => {
  return apiFetch<ExpenseLineDto>(getExpensesUpdateLineUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(updateExpenseLineRequest),
  })
}

export const getExpensesUpdateLineMutationKey = () => ['expensesUpdateLine'] as const

export const getExpensesUpdateLineMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof expensesUpdateLine>>,
    TError,
    ExpensesUpdateLineMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof expensesUpdateLine>>,
  TError,
  ExpensesUpdateLineMutationVariables,
  TContext
> => {
  const mutationKey = getExpensesUpdateLineMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof expensesUpdateLine>>,
    ExpensesUpdateLineMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return expensesUpdateLine(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ExpensesUpdateLineMutationResult = NonNullable<Awaited<ReturnType<typeof expensesUpdateLine>>>
export type ExpensesUpdateLineMutationBody = UpdateExpenseLineRequest
export type ExpensesUpdateLineMutationError = unknown
export type ExpensesUpdateLineMutationVariables = { id: string; data: UpdateExpenseLineRequest }

export const useExpensesUpdateLine = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof expensesUpdateLine>>,
      TError,
      ExpensesUpdateLineMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof expensesUpdateLine>>,
  TError,
  ExpensesUpdateLineMutationVariables,
  TContext
> => {
  return useMutation(getExpensesUpdateLineMutationOptions(options), queryClient)
}
export const getExpensesRemoveLineUrl = (id: string) => {
  return `/api/expenses/lines/${id}`
}

export const expensesRemoveLine = async (
  id: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<void> => {
  return apiFetch<void>(getExpensesRemoveLineUrl(id), {
    ...options,
    method: 'DELETE',
  })
}

export const getExpensesRemoveLineMutationKey = () => ['expensesRemoveLine'] as const

export const getExpensesRemoveLineMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof expensesRemoveLine>>,
    TError,
    ExpensesRemoveLineMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof expensesRemoveLine>>,
  TError,
  ExpensesRemoveLineMutationVariables,
  TContext
> => {
  const mutationKey = getExpensesRemoveLineMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof expensesRemoveLine>>,
    ExpensesRemoveLineMutationVariables
  > = (props) => {
    const { id } = props ?? {}

    return expensesRemoveLine(id, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ExpensesRemoveLineMutationResult = NonNullable<Awaited<ReturnType<typeof expensesRemoveLine>>>

export type ExpensesRemoveLineMutationError = unknown
export type ExpensesRemoveLineMutationVariables = { id: string }

export const useExpensesRemoveLine = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof expensesRemoveLine>>,
      TError,
      ExpensesRemoveLineMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof expensesRemoveLine>>,
  TError,
  ExpensesRemoveLineMutationVariables,
  TContext
> => {
  return useMutation(getExpensesRemoveLineMutationOptions(options), queryClient)
}
export const getExpensesSetDayNoteUrl = (day: string) => {
  return `/api/expenses/days/${day}/note`
}

export const expensesSetDayNote = async (
  day: string,
  setExpenseDayNoteRequest: SetExpenseDayNoteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ExpenseDayDto> => {
  return apiFetch<ExpenseDayDto>(getExpensesSetDayNoteUrl(day), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(setExpenseDayNoteRequest),
  })
}

export const getExpensesSetDayNoteMutationKey = () => ['expensesSetDayNote'] as const

export const getExpensesSetDayNoteMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof expensesSetDayNote>>,
    TError,
    ExpensesSetDayNoteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof expensesSetDayNote>>,
  TError,
  ExpensesSetDayNoteMutationVariables,
  TContext
> => {
  const mutationKey = getExpensesSetDayNoteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof expensesSetDayNote>>,
    ExpensesSetDayNoteMutationVariables
  > = (props) => {
    const { day, data } = props ?? {}

    return expensesSetDayNote(day, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ExpensesSetDayNoteMutationResult = NonNullable<Awaited<ReturnType<typeof expensesSetDayNote>>>
export type ExpensesSetDayNoteMutationBody = SetExpenseDayNoteRequest
export type ExpensesSetDayNoteMutationError = unknown
export type ExpensesSetDayNoteMutationVariables = { day: string; data: SetExpenseDayNoteRequest }

export const useExpensesSetDayNote = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof expensesSetDayNote>>,
      TError,
      ExpensesSetDayNoteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof expensesSetDayNote>>,
  TError,
  ExpensesSetDayNoteMutationVariables,
  TContext
> => {
  return useMutation(getExpensesSetDayNoteMutationOptions(options), queryClient)
}
export const getExpensesReportUrl = (params?: ExpensesReportParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/expenses?${stringifiedParams}` : `/api/expenses`
}

export const expensesReport = async (
  params?: ExpensesReportParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ExpenseReportDto> => {
  return apiFetch<ExpenseReportDto>(getExpensesReportUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getExpensesReportQueryKey = (params?: ExpensesReportParams) => {
  return [`/api/expenses`, ...(params ? [params] : [])] as const
}

export const getExpensesReportQueryOptions = <
  TData = Awaited<ReturnType<typeof expensesReport>>,
  TError = unknown,
>(
  params?: ExpensesReportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesReport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getExpensesReportQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof expensesReport>>> = ({ signal }) =>
    expensesReport(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof expensesReport>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type ExpensesReportQueryResult = NonNullable<Awaited<ReturnType<typeof expensesReport>>>
export type ExpensesReportQueryError = unknown

export function useExpensesReport<TData = Awaited<ReturnType<typeof expensesReport>>, TError = unknown>(
  params: undefined | ExpensesReportParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesReport>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesReport>>,
          TError,
          Awaited<ReturnType<typeof expensesReport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesReport<TData = Awaited<ReturnType<typeof expensesReport>>, TError = unknown>(
  params?: ExpensesReportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesReport>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesReport>>,
          TError,
          Awaited<ReturnType<typeof expensesReport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesReport<TData = Awaited<ReturnType<typeof expensesReport>>, TError = unknown>(
  params?: ExpensesReportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesReport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesReport<TData = Awaited<ReturnType<typeof expensesReport>>, TError = unknown>(
  params?: ExpensesReportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesReport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getExpensesReportQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getExpensesMonthReportUrl = (params?: ExpensesMonthReportParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/expenses/month-report?${stringifiedParams}`
    : `/api/expenses/month-report`
}

export const expensesMonthReport = async (
  params?: ExpensesMonthReportParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ExpenseReportDto> => {
  return apiFetch<ExpenseReportDto>(getExpensesMonthReportUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getExpensesMonthReportQueryKey = (params?: ExpensesMonthReportParams) => {
  return [`/api/expenses/month-report`, ...(params ? [params] : [])] as const
}

export const getExpensesMonthReportQueryOptions = <
  TData = Awaited<ReturnType<typeof expensesMonthReport>>,
  TError = unknown,
>(
  params?: ExpensesMonthReportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonthReport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getExpensesMonthReportQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof expensesMonthReport>>> = ({ signal }) =>
    expensesMonthReport(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof expensesMonthReport>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type ExpensesMonthReportQueryResult = NonNullable<Awaited<ReturnType<typeof expensesMonthReport>>>
export type ExpensesMonthReportQueryError = unknown

export function useExpensesMonthReport<
  TData = Awaited<ReturnType<typeof expensesMonthReport>>,
  TError = unknown,
>(
  params: undefined | ExpensesMonthReportParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonthReport>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesMonthReport>>,
          TError,
          Awaited<ReturnType<typeof expensesMonthReport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesMonthReport<
  TData = Awaited<ReturnType<typeof expensesMonthReport>>,
  TError = unknown,
>(
  params?: ExpensesMonthReportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonthReport>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesMonthReport>>,
          TError,
          Awaited<ReturnType<typeof expensesMonthReport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesMonthReport<
  TData = Awaited<ReturnType<typeof expensesMonthReport>>,
  TError = unknown,
>(
  params?: ExpensesMonthReportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonthReport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesMonthReport<
  TData = Awaited<ReturnType<typeof expensesMonthReport>>,
  TError = unknown,
>(
  params?: ExpensesMonthReportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesMonthReport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getExpensesMonthReportQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getExpensesExportUrl = (params?: ExpensesExportParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/expenses/export?${stringifiedParams}` : `/api/expenses/export`
}

export const expensesExport = async (
  params?: ExpensesExportParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<Stream> => {
  return apiFetch<Stream>(getExpensesExportUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getExpensesExportQueryKey = (params?: ExpensesExportParams) => {
  return [`/api/expenses/export`, ...(params ? [params] : [])] as const
}

export const getExpensesExportQueryOptions = <
  TData = Awaited<ReturnType<typeof expensesExport>>,
  TError = unknown,
>(
  params?: ExpensesExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getExpensesExportQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof expensesExport>>> = ({ signal }) =>
    expensesExport(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof expensesExport>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type ExpensesExportQueryResult = NonNullable<Awaited<ReturnType<typeof expensesExport>>>
export type ExpensesExportQueryError = unknown

export function useExpensesExport<TData = Awaited<ReturnType<typeof expensesExport>>, TError = unknown>(
  params: undefined | ExpensesExportParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesExport>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesExport>>,
          TError,
          Awaited<ReturnType<typeof expensesExport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesExport<TData = Awaited<ReturnType<typeof expensesExport>>, TError = unknown>(
  params?: ExpensesExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesExport>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesExport>>,
          TError,
          Awaited<ReturnType<typeof expensesExport>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesExport<TData = Awaited<ReturnType<typeof expensesExport>>, TError = unknown>(
  params?: ExpensesExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesExport<TData = Awaited<ReturnType<typeof expensesExport>>, TError = unknown>(
  params?: ExpensesExportParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesExport>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getExpensesExportQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getExpensesStatementUrl = (params?: ExpensesStatementParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0
    ? `/api/expenses/statement?${stringifiedParams}`
    : `/api/expenses/statement`
}

export const expensesStatement = async (
  params?: ExpensesStatementParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<Stream> => {
  return apiFetch<Stream>(getExpensesStatementUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getExpensesStatementQueryKey = (params?: ExpensesStatementParams) => {
  return [`/api/expenses/statement`, ...(params ? [params] : [])] as const
}

export const getExpensesStatementQueryOptions = <
  TData = Awaited<ReturnType<typeof expensesStatement>>,
  TError = unknown,
>(
  params?: ExpensesStatementParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesStatement>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getExpensesStatementQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof expensesStatement>>> = ({ signal }) =>
    expensesStatement(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof expensesStatement>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type ExpensesStatementQueryResult = NonNullable<Awaited<ReturnType<typeof expensesStatement>>>
export type ExpensesStatementQueryError = unknown

export function useExpensesStatement<TData = Awaited<ReturnType<typeof expensesStatement>>, TError = unknown>(
  params: undefined | ExpensesStatementParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesStatement>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesStatement>>,
          TError,
          Awaited<ReturnType<typeof expensesStatement>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesStatement<TData = Awaited<ReturnType<typeof expensesStatement>>, TError = unknown>(
  params?: ExpensesStatementParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesStatement>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof expensesStatement>>,
          TError,
          Awaited<ReturnType<typeof expensesStatement>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesStatement<TData = Awaited<ReturnType<typeof expensesStatement>>, TError = unknown>(
  params?: ExpensesStatementParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesStatement>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useExpensesStatement<TData = Awaited<ReturnType<typeof expensesStatement>>, TError = unknown>(
  params?: ExpensesStatementParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof expensesStatement>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getExpensesStatementQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}
