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
  MoveProductsRequest,
  ProductDto,
  ProductsAddBrochureImageBody,
  ProductsListParams,
  ProductsSetImageBody,
  ReorderProductImagesRequest,
  SaveProductRequest,
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
export const getProductsMoveToLineUrl = () => {
  return `/api/products/move-to-line`
}

export const productsMoveToLine = async (
  moveProductsRequest: MoveProductsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getProductsMoveToLineUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(moveProductsRequest),
  })
}

export const getProductsMoveToLineMutationKey = () => ['productsMoveToLine'] as const

export const getProductsMoveToLineMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsMoveToLine>>,
    TError,
    ProductsMoveToLineMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsMoveToLine>>,
  TError,
  ProductsMoveToLineMutationVariables,
  TContext
> => {
  const mutationKey = getProductsMoveToLineMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsMoveToLine>>,
    ProductsMoveToLineMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return productsMoveToLine(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsMoveToLineMutationResult = NonNullable<Awaited<ReturnType<typeof productsMoveToLine>>>
export type ProductsMoveToLineMutationBody = MoveProductsRequest
export type ProductsMoveToLineMutationError = unknown
export type ProductsMoveToLineMutationVariables = { data: MoveProductsRequest }

export const useProductsMoveToLine = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsMoveToLine>>,
      TError,
      ProductsMoveToLineMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsMoveToLine>>,
  TError,
  ProductsMoveToLineMutationVariables,
  TContext
> => {
  return useMutation(getProductsMoveToLineMutationOptions(options), queryClient)
}
export const getProductsBulkDeleteUrl = () => {
  return `/api/products/bulk-delete`
}

export const productsBulkDelete = async (
  bulkDeleteRequest: BulkDeleteRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getProductsBulkDeleteUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkDeleteRequest),
  })
}

export const getProductsBulkDeleteMutationKey = () => ['productsBulkDelete'] as const

export const getProductsBulkDeleteMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsBulkDelete>>,
    TError,
    ProductsBulkDeleteMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsBulkDelete>>,
  TError,
  ProductsBulkDeleteMutationVariables,
  TContext
> => {
  const mutationKey = getProductsBulkDeleteMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsBulkDelete>>,
    ProductsBulkDeleteMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return productsBulkDelete(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsBulkDeleteMutationResult = NonNullable<Awaited<ReturnType<typeof productsBulkDelete>>>
export type ProductsBulkDeleteMutationBody = BulkDeleteRequest
export type ProductsBulkDeleteMutationError = unknown
export type ProductsBulkDeleteMutationVariables = { data: BulkDeleteRequest }

export const useProductsBulkDelete = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsBulkDelete>>,
      TError,
      ProductsBulkDeleteMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsBulkDelete>>,
  TError,
  ProductsBulkDeleteMutationVariables,
  TContext
> => {
  return useMutation(getProductsBulkDeleteMutationOptions(options), queryClient)
}
export const getProductsBulkRestoreUrl = () => {
  return `/api/products/bulk-restore`
}

export const productsBulkRestore = async (
  bulkIdsRequest: BulkIdsRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<BulkResult> => {
  return apiFetch<BulkResult>(getProductsBulkRestoreUrl(), {
    ...options,
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(bulkIdsRequest),
  })
}

export const getProductsBulkRestoreMutationKey = () => ['productsBulkRestore'] as const

export const getProductsBulkRestoreMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsBulkRestore>>,
    TError,
    ProductsBulkRestoreMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsBulkRestore>>,
  TError,
  ProductsBulkRestoreMutationVariables,
  TContext
> => {
  const mutationKey = getProductsBulkRestoreMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsBulkRestore>>,
    ProductsBulkRestoreMutationVariables
  > = (props) => {
    const { data } = props ?? {}

    return productsBulkRestore(data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsBulkRestoreMutationResult = NonNullable<Awaited<ReturnType<typeof productsBulkRestore>>>
export type ProductsBulkRestoreMutationBody = BulkIdsRequest
export type ProductsBulkRestoreMutationError = unknown
export type ProductsBulkRestoreMutationVariables = { data: BulkIdsRequest }

export const useProductsBulkRestore = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsBulkRestore>>,
      TError,
      ProductsBulkRestoreMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsBulkRestore>>,
  TError,
  ProductsBulkRestoreMutationVariables,
  TContext
> => {
  return useMutation(getProductsBulkRestoreMutationOptions(options), queryClient)
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
export const getProductsAddBrochureImageUrl = (id: string) => {
  return `/api/products/${id}/images`
}

export const productsAddBrochureImage = async (
  id: string,
  productsAddBrochureImageBody: ProductsAddBrochureImageBody,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductDto> => {
  const formData = new FormData()
  if (productsAddBrochureImageBody.file !== undefined) {
    formData.append(`file`, productsAddBrochureImageBody.file)
  }

  return apiFetch<ProductDto>(getProductsAddBrochureImageUrl(id), {
    ...options,
    method: 'POST',
    body: formData,
  })
}

export const getProductsAddBrochureImageMutationKey = () => ['productsAddBrochureImage'] as const

export const getProductsAddBrochureImageMutationOptions = <TError = unknown, TContext = unknown>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsAddBrochureImage>>,
    TError,
    ProductsAddBrochureImageMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsAddBrochureImage>>,
  TError,
  ProductsAddBrochureImageMutationVariables,
  TContext
> => {
  const mutationKey = getProductsAddBrochureImageMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsAddBrochureImage>>,
    ProductsAddBrochureImageMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return productsAddBrochureImage(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsAddBrochureImageMutationResult = NonNullable<
  Awaited<ReturnType<typeof productsAddBrochureImage>>
>
export type ProductsAddBrochureImageMutationBody = ProductsAddBrochureImageBody
export type ProductsAddBrochureImageMutationError = unknown
export type ProductsAddBrochureImageMutationVariables = { id: string; data: ProductsAddBrochureImageBody }

export const useProductsAddBrochureImage = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsAddBrochureImage>>,
      TError,
      ProductsAddBrochureImageMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsAddBrochureImage>>,
  TError,
  ProductsAddBrochureImageMutationVariables,
  TContext
> => {
  return useMutation(getProductsAddBrochureImageMutationOptions(options), queryClient)
}
export const getProductsGetBrochureImageUrl = (id: string, imageId: string) => {
  return `/api/products/${id}/images/${imageId}`
}

export const productsGetBrochureImage = async (
  id: string,
  imageId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<Blob> => {
  return apiFetch<Blob>(getProductsGetBrochureImageUrl(id, imageId), {
    ...options,
    method: 'GET',
  })
}

export const getProductsGetBrochureImageQueryKey = (id: string, imageId: string) => {
  return [`/api/products/${id}/images/${imageId}`] as const
}

export const getProductsGetBrochureImageQueryOptions = <
  TData = Awaited<ReturnType<typeof productsGetBrochureImage>>,
  TError = unknown,
>(
  id: string,
  imageId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsGetBrochureImage>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
) => {
  const { query: queryOptions, request: requestOptions } = options ?? {}

  const queryKey = queryOptions?.queryKey ?? getProductsGetBrochureImageQueryKey(id, imageId)

  const queryFn: QueryFunction<Awaited<ReturnType<typeof productsGetBrochureImage>>> = ({ signal }) =>
    productsGetBrochureImage(id, imageId, { signal, ...requestOptions })

  return {
    queryKey,
    queryFn,
    enabled: id !== null && id !== undefined && imageId !== null && imageId !== undefined,
    ...queryOptions,
  } as UseQueryOptions<Awaited<ReturnType<typeof productsGetBrochureImage>>, TError, TData> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }
}

export type ProductsGetBrochureImageQueryResult = NonNullable<
  Awaited<ReturnType<typeof productsGetBrochureImage>>
>
export type ProductsGetBrochureImageQueryError = unknown

export function useProductsGetBrochureImage<
  TData = Awaited<ReturnType<typeof productsGetBrochureImage>>,
  TError = unknown,
>(
  id: string,
  imageId: string,
  options: {
    query: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsGetBrochureImage>>, TError, TData>> &
      Pick<
        DefinedInitialDataOptions<
          Awaited<ReturnType<typeof productsGetBrochureImage>>,
          TError,
          Awaited<ReturnType<typeof productsGetBrochureImage>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): DefinedUseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductsGetBrochureImage<
  TData = Awaited<ReturnType<typeof productsGetBrochureImage>>,
  TError = unknown,
>(
  id: string,
  imageId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsGetBrochureImage>>, TError, TData>> &
      Pick<
        UndefinedInitialDataOptions<
          Awaited<ReturnType<typeof productsGetBrochureImage>>,
          TError,
          Awaited<ReturnType<typeof productsGetBrochureImage>>
        >,
        'initialData'
      >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductsGetBrochureImage<
  TData = Awaited<ReturnType<typeof productsGetBrochureImage>>,
  TError = unknown,
>(
  id: string,
  imageId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsGetBrochureImage>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> }
export function useProductsGetBrochureImage<
  TData = Awaited<ReturnType<typeof productsGetBrochureImage>>,
  TError = unknown,
>(
  id: string,
  imageId: string,
  options?: {
    query?: Partial<UseQueryOptions<Awaited<ReturnType<typeof productsGetBrochureImage>>, TError, TData>>
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> } {
  const queryOptions = getProductsGetBrochureImageQueryOptions(id, imageId, options)

  const query = useQuery(queryOptions, queryClient) as UseQueryResult<TData, TError> & {
    queryKey: DataTag<QueryKey, TData, TError>
  }

  return withQueryKey(query, queryOptions.queryKey)
}

export const getProductsRemoveBrochureImageUrl = (id: string, imageId: string) => {
  return `/api/products/${id}/images/${imageId}`
}

export const productsRemoveBrochureImage = async (
  id: string,
  imageId: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductDto> => {
  return apiFetch<ProductDto>(getProductsRemoveBrochureImageUrl(id, imageId), {
    ...options,
    method: 'DELETE',
  })
}

export const getProductsRemoveBrochureImageMutationKey = () => ['productsRemoveBrochureImage'] as const

export const getProductsRemoveBrochureImageMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsRemoveBrochureImage>>,
    TError,
    ProductsRemoveBrochureImageMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsRemoveBrochureImage>>,
  TError,
  ProductsRemoveBrochureImageMutationVariables,
  TContext
> => {
  const mutationKey = getProductsRemoveBrochureImageMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsRemoveBrochureImage>>,
    ProductsRemoveBrochureImageMutationVariables
  > = (props) => {
    const { id, imageId } = props ?? {}

    return productsRemoveBrochureImage(id, imageId, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsRemoveBrochureImageMutationResult = NonNullable<
  Awaited<ReturnType<typeof productsRemoveBrochureImage>>
>

export type ProductsRemoveBrochureImageMutationError = unknown
export type ProductsRemoveBrochureImageMutationVariables = { id: string; imageId: string }

export const useProductsRemoveBrochureImage = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsRemoveBrochureImage>>,
      TError,
      ProductsRemoveBrochureImageMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsRemoveBrochureImage>>,
  TError,
  ProductsRemoveBrochureImageMutationVariables,
  TContext
> => {
  return useMutation(getProductsRemoveBrochureImageMutationOptions(options), queryClient)
}
export const getProductsReorderBrochureImagesUrl = (id: string) => {
  return `/api/products/${id}/images/order`
}

export const productsReorderBrochureImages = async (
  id: string,
  reorderProductImagesRequest: ReorderProductImagesRequest,
  options?: Parameters<typeof apiFetch>[1],
): Promise<ProductDto> => {
  return apiFetch<ProductDto>(getProductsReorderBrochureImagesUrl(id), {
    ...options,
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }, options?.headers),
    body: JSON.stringify(reorderProductImagesRequest),
  })
}

export const getProductsReorderBrochureImagesMutationKey = () => ['productsReorderBrochureImages'] as const

export const getProductsReorderBrochureImagesMutationOptions = <
  TError = unknown,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    Awaited<ReturnType<typeof productsReorderBrochureImages>>,
    TError,
    ProductsReorderBrochureImagesMutationVariables,
    TContext
  >
  request?: SecondParameter<typeof apiFetch>
}): UseMutationOptions<
  Awaited<ReturnType<typeof productsReorderBrochureImages>>,
  TError,
  ProductsReorderBrochureImagesMutationVariables,
  TContext
> => {
  const mutationKey = getProductsReorderBrochureImagesMutationKey()
  const { mutation: mutationOptions, request: requestOptions } = options
    ? options.mutation && 'mutationKey' in options.mutation && options.mutation.mutationKey
      ? options
      : { ...options, mutation: { ...options.mutation, mutationKey } }
    : { mutation: { mutationKey }, request: undefined }

  const mutationFn: MutationFunction<
    Awaited<ReturnType<typeof productsReorderBrochureImages>>,
    ProductsReorderBrochureImagesMutationVariables
  > = (props) => {
    const { id, data } = props ?? {}

    return productsReorderBrochureImages(id, data, requestOptions)
  }

  return { mutationFn, ...mutationOptions }
}

export type ProductsReorderBrochureImagesMutationResult = NonNullable<
  Awaited<ReturnType<typeof productsReorderBrochureImages>>
>
export type ProductsReorderBrochureImagesMutationBody = ReorderProductImagesRequest
export type ProductsReorderBrochureImagesMutationError = unknown
export type ProductsReorderBrochureImagesMutationVariables = { id: string; data: ReorderProductImagesRequest }

export const useProductsReorderBrochureImages = <TError = unknown, TContext = unknown>(
  options?: {
    mutation?: UseMutationOptions<
      Awaited<ReturnType<typeof productsReorderBrochureImages>>,
      TError,
      ProductsReorderBrochureImagesMutationVariables,
      TContext
    >
    request?: SecondParameter<typeof apiFetch>
  },
  queryClient?: QueryClient,
): UseMutationResult<
  Awaited<ReturnType<typeof productsReorderBrochureImages>>,
  TError,
  ProductsReorderBrochureImagesMutationVariables,
  TContext
> => {
  return useMutation(getProductsReorderBrochureImagesMutationOptions(options), queryClient)
}
