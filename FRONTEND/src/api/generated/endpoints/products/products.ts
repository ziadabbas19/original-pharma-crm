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

import type { ProductDto, ProductsListParams, ProductsSetImageBody, SaveProductRequest } from '../../model'

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

export const getProductsListUrl = (params?: ProductsListParams) => {
  const normalizedParams = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      normalizedParams.append(key, value === null ? 'null' : String(value))
    }
  })

  const stringifiedParams = normalizedParams.toString()

  return stringifiedParams.length > 0 ? `/api/products?${stringifiedParams}` : `/api/products`
}

export const productsList = async (
  params?: ProductsListParams,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductDto[]> => {
  return apiFetch<ProductDto[]>(getProductsListUrl(params), {
    ...options,
    method: 'GET',
  })
}

export const getProductsListQueryKey = (params?: ProductsListParams) => {
  return [`/api/products`, ...(params ? [params] : [])] as const
}

export const getProductsListQueryOptions = <
  TData = Awaited<ReturnType<typeof productsList>>,
  TError = unknown,
>(
  params?: ProductsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getProductsListQueryKey(params)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof productsList>>> = ({ signal }) =>
    productsList(params, { signal, ...requestOptions })

  return { queryKey, queryFn, ...queryOptions } as UseQueryOptions<
    Awaited<ReturnType<typeof productsList>>,
    TError,
    TData
  > & { queryKey: DataTag<QueryKey, TData, TError> }
}

export type ProductsListQueryResult = NonNullable<Awaited<ReturnType<typeof productsList>>>
export type ProductsListQueryError = unknown

export function useProductsList<TData = Awaited<ReturnType<typeof productsList>>, TError = unknown>(
  params: undefined | ProductsListParams,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsList>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof productsList>>,
          TError,
          Awaited<ReturnType<typeof productsList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductsList<TData = Awaited<ReturnType<typeof productsList>>, TError = unknown>(
  params?: ProductsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsList>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof productsList>>,
          TError,
          Awaited<ReturnType<typeof productsList>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductsList<TData = Awaited<ReturnType<typeof productsList>>, TError = unknown>(
  params?: ProductsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductsList<TData = Awaited<ReturnType<typeof productsList>>, TError = unknown>(
  params?: ProductsListParams,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsList>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getProductsListQueryOptions(params, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getProductsCreateUrl = () => {
  return `/api/products`
}

export const productsCreate = async (
  saveProductRequest: SaveProductRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductDto> => {
  return apiFetch<ProductDto>(getProductsCreateUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveProductRequest),
  })
}

export const getProductsCreateMutationKey = () => ['productsCreate'] as const

export const getProductsCreateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsCreate>>,
    TError,
    ProductsCreateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsCreate>>,
  TError,
  ProductsCreateMutationVariables,
  TContext
> => {
  const mutationKey = getProductsCreateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsCreate>>,
    ProductsCreateMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return productsCreate(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsCreateMutationResult = NonNullable<Awaited<ReturnType<typeof productsCreate>>>
export type ProductsCreateMutationBody = SaveProductRequest
export type ProductsCreateMutationError = unknown
export type ProductsCreateMutationVariables = { data: SaveProductRequest }

export const useProductsCreate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsCreate>>,
      TError,
      ProductsCreateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsCreate>>,
  TError,
  ProductsCreateMutationVariables,
  TContext
> => {
  return useMutation(getProductsCreateMutationOptions(options), queryClient)
}
export const getProductsUpdateUrl = (id: string) => {
  return `/api/products/${id}`
}

export const productsUpdate = async (
  id: string,
  saveProductRequest: SaveProductRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductDto> => {
  return apiFetch<ProductDto>(getProductsUpdateUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(saveProductRequest),
  })
}

export const getProductsUpdateMutationKey = () => ['productsUpdate'] as const

export const getProductsUpdateMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsUpdate>>,
    TError,
    ProductsUpdateMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsUpdate>>,
  TError,
  ProductsUpdateMutationVariables,
  TContext
> => {
  const mutationKey = getProductsUpdateMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsUpdate>>,
    ProductsUpdateMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return productsUpdate(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsUpdateMutationResult = NonNullable<Awaited<ReturnType<typeof productsUpdate>>>
export type ProductsUpdateMutationBody = SaveProductRequest
export type ProductsUpdateMutationError = unknown
export type ProductsUpdateMutationVariables = { id: string; data: SaveProductRequest }

export const useProductsUpdate = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsUpdate>>,
      TError,
      ProductsUpdateMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsUpdate>>,
  TError,
  ProductsUpdateMutationVariables,
  TContext
> => {
  return useMutation(getProductsUpdateMutationOptions(options), queryClient)
}
export const getProductsSetImageUrl = (id: string) => {
  return `/api/products/${id}/image`
}

export const productsSetImage = async (
  id: string,
  productsSetImageBody: ProductsSetImageBody,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductDto> => {
  const formData = new FormData()
  if (productsSetImageBody.file !== undefined) {
    formData.append(`file`, productsSetImageBody.file)
  }

  return apiFetch<ProductDto>(getProductsSetImageUrl(id), {
    ...options,
    method: 'PUT',
    body: formData,
  })
}

export const getProductsSetImageMutationKey = () => ['productsSetImage'] as const

export const getProductsSetImageMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsSetImage>>,
    TError,
    ProductsSetImageMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsSetImage>>,
  TError,
  ProductsSetImageMutationVariables,
  TContext
> => {
  const mutationKey = getProductsSetImageMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsSetImage>>,
    ProductsSetImageMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return productsSetImage(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsSetImageMutationResult = NonNullable<Awaited<ReturnType<typeof productsSetImage>>>
export type ProductsSetImageMutationBody = ProductsSetImageBody
export type ProductsSetImageMutationError = unknown
export type ProductsSetImageMutationVariables = { id: string; data: ProductsSetImageBody }

export const useProductsSetImage = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsSetImage>>,
      TError,
      ProductsSetImageMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsSetImage>>,
  TError,
  ProductsSetImageMutationVariables,
  TContext
> => {
  return useMutation(getProductsSetImageMutationOptions(options), queryClient)
}
export const getProductsRemoveImageUrl = (id: string) => {
  return `/api/products/${id}/image`
}

export const productsRemoveImage = async (
  id: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductDto> => {
  return apiFetch<ProductDto>(getProductsRemoveImageUrl(id), {
    ...options,
    method: 'DELETE',
  })
}

export const getProductsRemoveImageMutationKey = () => ['productsRemoveImage'] as const

export const getProductsRemoveImageMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsRemoveImage>>,
    TError,
    ProductsRemoveImageMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsRemoveImage>>,
  TError,
  ProductsRemoveImageMutationVariables,
  TContext
> => {
  const mutationKey = getProductsRemoveImageMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsRemoveImage>>,
    ProductsRemoveImageMutationVariables
  > = (props) => {
    const { id } = props ?? {}

    return productsRemoveImage(id, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsRemoveImageMutationResult = NonNullable<Awaited<ReturnType<typeof productsRemoveImage>>>

export type ProductsRemoveImageMutationError = unknown
export type ProductsRemoveImageMutationVariables = { id: string }

export const useProductsRemoveImage = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsRemoveImage>>,
      TError,
      ProductsRemoveImageMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsRemoveImage>>,
  TError,
  ProductsRemoveImageMutationVariables,
  TContext
> => {
  return useMutation(getProductsRemoveImageMutationOptions(options), queryClient)
}
