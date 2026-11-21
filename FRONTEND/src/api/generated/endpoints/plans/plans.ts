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
  PlansListParams,
  PlansMineParams,
  ProblemDetails,
  ReviewWeeklyPlanRequest,
  SaveWeeklyPlanRequest,
  SubmitWeeklyPlanRequest,
  WeeklyPlanDto,
  WeeklyPlanPageDto,
  WeeklyPlanPendingDto,
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

export const getPlansMineUrl = (params?: PlansMineParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/plans/mine?${stringifiedParams}` : `/api/plans/mine`
}

export const plansMine = async (
  params?: PlansMineParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanDto> => {
  return apiFetch<WeeklyPlanDto>(getPlansMineUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getPlansMineQueryKey = (params?: PlansMineParams) => {
  return [`/api/plans/mine`, ...(params ? [params] : [])] as const
}

export const getPlansMineQueryOptions = <TData = Awaited<ReturnType<typeof plansMine>>, TError = unknown>(
  params?: PlansMineParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansMine>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getPlansMineQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof plansMine>>> = ({ signal }) =>
    plansMine(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof plansMine>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type PlansMineQueryResult = NonNullable<Awaited<ReturnType<typeof plansMine>>>
export type PlansMineQueryError = unknown

export function usePlansMine<TData = Awaited<ReturnType<typeof plansMine>>, TError = unknown>(
  params: undefined | PlansMineParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansMine>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof plansMine>>,
          TError,
          Awaited<ReturnType<typeof plansMine>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansMine<TData = Awaited<ReturnType<typeof plansMine>>, TError = unknown>(
  params?: PlansMineParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansMine>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof plansMine>>,
          TError,
          Awaited<ReturnType<typeof plansMine>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansMine<TData = Awaited<ReturnType<typeof plansMine>>, TError = unknown>(
  params?: PlansMineParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansMine>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansMine<TData = Awaited<ReturnType<typeof plansMine>>, TError = unknown>(
  params?: PlansMineParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansMine>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getPlansMineQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getPlansSaveDraftUrl = () => {
  return `/api/plans/mine`
}

export const plansSaveDraft = async (
  saveWeeklyPlanRequest: SaveWeeklyPlanRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanDto> => {
  return apiFetch<WeeklyPlanDto>(getPlansSaveDraftUrl(), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveWeeklyPlanRequest),
  })
}

export const getPlansSaveDraftMutationKey = () => ['plansSaveDraft'] as const

export const getPlansSaveDraftMutationOptions = <TError = ProblemDetails, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof plansSaveDraft>>,
    TError,
    PlansSaveDraftMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof plansSaveDraft>>,
  TError,
  PlansSaveDraftMutationVariables,
  TContext
> => {
  const mutationKey = getPlansSaveDraftMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof plansSaveDraft>>,
    PlansSaveDraftMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return plansSaveDraft(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type PlansSaveDraftMutationResult = NonNullable<Awaited<ReturnType<typeof plansSaveDraft>>>
export type PlansSaveDraftMutationBody = SaveWeeklyPlanRequest
export type PlansSaveDraftMutationError = ProblemDetails
export type PlansSaveDraftMutationVariables = { data: SaveWeeklyPlanRequest }

export const usePlansSaveDraft = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof plansSaveDraft>>,
      TError,
      PlansSaveDraftMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof plansSaveDraft>>,
  TError,
  PlansSaveDraftMutationVariables,
  TContext
> => {
  return useMutation(getPlansSaveDraftMutationOptions(options), queryClient)
}
export const getPlansSubmitUrl = (id: string) => {
  return `/api/plans/${id}/submit`
}

export const plansSubmit = async (
  id: string,
  submitWeeklyPlanRequest: SubmitWeeklyPlanRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanDto> => {
  return apiFetch<WeeklyPlanDto>(getPlansSubmitUrl(id), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(submitWeeklyPlanRequest),
  })
}

export const getPlansSubmitMutationKey = () => ['plansSubmit'] as const

export const getPlansSubmitMutationOptions = <TError = ProblemDetails, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof plansSubmit>>,
    TError,
    PlansSubmitMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof plansSubmit>>,
  TError,
  PlansSubmitMutationVariables,
  TContext
> => {
  const mutationKey = getPlansSubmitMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof plansSubmit>>,
    PlansSubmitMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return plansSubmit(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type PlansSubmitMutationResult = NonNullable<Awaited<ReturnType<typeof plansSubmit>>>
export type PlansSubmitMutationBody = SubmitWeeklyPlanRequest
export type PlansSubmitMutationError = ProblemDetails
export type PlansSubmitMutationVariables = { id: string; data: SubmitWeeklyPlanRequest }

export const usePlansSubmit = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof plansSubmit>>,
      TError,
      PlansSubmitMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof plansSubmit>>,
  TError,
  PlansSubmitMutationVariables,
  TContext
> => {
  return useMutation(getPlansSubmitMutationOptions(options), queryClient)
}
export const getPlansListUrl = (params?: PlansListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/plans?${stringifiedParams}` : `/api/plans`
}

export const plansList = async (
  params?: PlansListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanPageDto> => {
  return apiFetch<WeeklyPlanPageDto>(getPlansListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getPlansListQueryKey = (params?: PlansListParams) => {
  return [`/api/plans`, ...(params ? [params] : [])] as const
}

export const getPlansListQueryOptions = <TData = Awaited<ReturnType<typeof plansList>>, TError = unknown>(
  params?: PlansListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getPlansListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof plansList>>> = ({ signal }) =>
    plansList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof plansList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type PlansListQueryResult = NonNullable<Awaited<ReturnType<typeof plansList>>>
export type PlansListQueryError = unknown

export function usePlansList<TData = Awaited<ReturnType<typeof plansList>>, TError = unknown>(
  params: undefined | PlansListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof plansList>>,
          TError,
          Awaited<ReturnType<typeof plansList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansList<TData = Awaited<ReturnType<typeof plansList>>, TError = unknown>(
  params?: PlansListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof plansList>>,
          TError,
          Awaited<ReturnType<typeof plansList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansList<TData = Awaited<ReturnType<typeof plansList>>, TError = unknown>(
  params?: PlansListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansList<TData = Awaited<ReturnType<typeof plansList>>, TError = unknown>(
  params?: PlansListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getPlansListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getPlansPendingCountUrl = () => {
  return `/api/plans/pending-count`
}

export const plansPendingCount = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanPendingDto> => {
  return apiFetch<WeeklyPlanPendingDto>(getPlansPendingCountUrl(), {
    ...options,
    method: 'GET',
  })
}

export const getPlansPendingCountQueryKey = () => {
  return [`/api/plans/pending-count`] as const
}

export const getPlansPendingCountQueryOptions = <
  TData = Awaited<ReturnType<typeof plansPendingCount>>,
  TError = unknown,
>(options?: {
  query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansPendingCount>>, TError, TData>>
  request?: SecondParameter<typeof apiFetch>
}) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getPlansPendingCountQueryKey()

  const queryFn: QueryFunction<Awaited<ReturnType<typeof plansPendingCount>>> = ({ signal }) =>
    plansPendingCount({ signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof plansPendingCount>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type PlansPendingCountQueryResult = NonNullable<Awaited<ReturnType<typeof plansPendingCount>>>
export type PlansPendingCountQueryError = unknown

export function usePlansPendingCount<TData = Awaited<ReturnType<typeof plansPendingCount>>, TError = unknown>(
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansPendingCount>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof plansPendingCount>>,
          TError,
          Awaited<ReturnType<typeof plansPendingCount>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansPendingCount<TData = Awaited<ReturnType<typeof plansPendingCount>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansPendingCount>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof plansPendingCount>>,
          TError,
          Awaited<ReturnType<typeof plansPendingCount>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansPendingCount<TData = Awaited<ReturnType<typeof plansPendingCount>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansPendingCount>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansPendingCount<TData = Awaited<ReturnType<typeof plansPendingCount>>, TError = unknown>(
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansPendingCount>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getPlansPendingCountQueryOptions(options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getPlansGetUrl = (id: string) => {
  return `/api/plans/${id}`
}

export const plansGet = async (
  id: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanDto> => {
  return apiFetch<WeeklyPlanDto>(getPlansGetUrl(id), {
    ...options,
    method: 'GET',
  })
}

export const getPlansGetQueryKey = (id: string) => {
  return [`/api/plans/${id}`] as const
}

export const getPlansGetQueryOptions = <TData = Awaited<ReturnType<typeof plansGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getPlansGetQueryKey(id)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof plansGet>>> = ({ signal }) =>
    plansGet(id, { signal, ...requestOptions })

  return { queryKey, queryFn, enabled: id !== null && id !== undefined, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof plansGet>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type PlansGetQueryResult = NonNullable<Awaited<ReturnType<typeof plansGet>>>
export type PlansGetQueryError = unknown

export function usePlansGet<TData = Awaited<ReturnType<typeof plansGet>>, TError = unknown>(
  id: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansGet>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof plansGet>>,
          TError,
          Awaited<ReturnType<typeof plansGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansGet<TData = Awaited<ReturnType<typeof plansGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansGet>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof plansGet>>,
          TError,
          Awaited<ReturnType<typeof plansGet>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansGet<TData = Awaited<ReturnType<typeof plansGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function usePlansGet<TData = Awaited<ReturnType<typeof plansGet>>, TError = unknown>(
  id: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof plansGet>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getPlansGetQueryOptions(id, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getPlansApproveUrl = (id: string) => {
  return `/api/plans/${id}/approve`
}

export const plansApprove = async (
  id: string,
  reviewWeeklyPlanRequest: ReviewWeeklyPlanRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanDto> => {
  return apiFetch<WeeklyPlanDto>(getPlansApproveUrl(id), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(reviewWeeklyPlanRequest),
  })
}

export const getPlansApproveMutationKey = () => ['plansApprove'] as const

export const getPlansApproveMutationOptions = <TError = ProblemDetails, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof plansApprove>>,
    TError,
    PlansApproveMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof plansApprove>>,
  TError,
  PlansApproveMutationVariables,
  TContext
> => {
  const mutationKey = getPlansApproveMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof plansApprove>>,
    PlansApproveMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return plansApprove(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type PlansApproveMutationResult = NonNullable<Awaited<ReturnType<typeof plansApprove>>>
export type PlansApproveMutationBody = ReviewWeeklyPlanRequest
export type PlansApproveMutationError = ProblemDetails
export type PlansApproveMutationVariables = { id: string; data: ReviewWeeklyPlanRequest }

export const usePlansApprove = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof plansApprove>>,
      TError,
      PlansApproveMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof plansApprove>>,
  TError,
  PlansApproveMutationVariables,
  TContext
> => {
  return useMutation(getPlansApproveMutationOptions(options), queryClient)
}
export const getPlansReturnUrl = (id: string) => {
  return `/api/plans/${id}/return`
}

export const plansReturn = async (
  id: string,
  reviewWeeklyPlanRequest: ReviewWeeklyPlanRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanDto> => {
  return apiFetch<WeeklyPlanDto>(getPlansReturnUrl(id), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(reviewWeeklyPlanRequest),
  })
}

export const getPlansReturnMutationKey = () => ['plansReturn'] as const

export const getPlansReturnMutationOptions = <TError = ProblemDetails, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof plansReturn>>,
    TError,
    PlansReturnMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof plansReturn>>,
  TError,
  PlansReturnMutationVariables,
  TContext
> => {
  const mutationKey = getPlansReturnMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof plansReturn>>,
    PlansReturnMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return plansReturn(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type PlansReturnMutationResult = NonNullable<Awaited<ReturnType<typeof plansReturn>>>
export type PlansReturnMutationBody = ReviewWeeklyPlanRequest
export type PlansReturnMutationError = ProblemDetails
export type PlansReturnMutationVariables = { id: string; data: ReviewWeeklyPlanRequest }

export const usePlansReturn = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof plansReturn>>,
      TError,
      PlansReturnMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof plansReturn>>,
  TError,
  PlansReturnMutationVariables,
  TContext
> => {
  return useMutation(getPlansReturnMutationOptions(options), queryClient)
}
export const getPlansReopenUrl = (id: string) => {
  return `/api/plans/${id}/reopen`
}

export const plansReopen = async (
  id: string,
  reviewWeeklyPlanRequest: ReviewWeeklyPlanRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<WeeklyPlanDto> => {
  return apiFetch<WeeklyPlanDto>(getPlansReopenUrl(id), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(reviewWeeklyPlanRequest),
  })
}

export const getPlansReopenMutationKey = () => ['plansReopen'] as const

export const getPlansReopenMutationOptions = <TError = ProblemDetails, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof plansReopen>>,
    TError,
    PlansReopenMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof plansReopen>>,
  TError,
  PlansReopenMutationVariables,
  TContext
> => {
  const mutationKey = getPlansReopenMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof plansReopen>>,
    PlansReopenMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return plansReopen(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type PlansReopenMutationResult = NonNullable<Awaited<ReturnType<typeof plansReopen>>>
export type PlansReopenMutationBody = ReviewWeeklyPlanRequest
export type PlansReopenMutationError = ProblemDetails
export type PlansReopenMutationVariables = { id: string; data: ReviewWeeklyPlanRequest }

export const usePlansReopen = <TError = ProblemDetails, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof plansReopen>>,
      TError,
      PlansReopenMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof plansReopen>>,
  TError,
  PlansReopenMutationVariables,
  TContext
> => {
  return useMutation(getPlansReopenMutationOptions(options), queryClient)
}
