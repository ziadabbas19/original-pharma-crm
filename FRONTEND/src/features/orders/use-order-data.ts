import { useEffect } from 'react'
import {
  getProductLinesListQueryKey,
  getProductsListQueryKey,
  useLookupsListCollectionMethods,
  useLookupsListSpecialties,
  useLookupsListTowns,
  useProductLinesList,
  useProductsList,
} from '@/api/generated/endpoints'
import { readCache, writeCache } from '@/lib/offline-cache'
import { useAppSelector } from '@/store'

const STALE = 5 * 60_000

/** Query options that start from the device copy (offline) and refresh it on every success. */
function cached<T>(key: string, owner?: string) {
  const copy = readCache<T>(key, owner)
  return {
    staleTime: STALE,
    initialData: copy?.data,
    initialDataUpdatedAt: copy?.savedAt,
  }
}

function useKeepCopy<T>(key: string, data: T | undefined, isFetchedAfterMount: boolean, owner?: string) {
  useEffect(() => {
    if (data !== undefined && isFetchedAfterMount) writeCache(key, data, owner)
  }, [key, data, isFetchedAfterMount, owner])
}

/**
 * Who the catalog was loaded for. The server limits products to the user's lines and bumps the
 * permissions version when they change, so a copy (in memory or on the device) is only reused by
 * the same user at the same version.
 */
function useCatalogOwner(): string {
  const userId = useAppSelector((s) => s.auth.user?.id ?? '')
  const version = useAppSelector((s) => s.permissions.version)
  return `${userId}.${version}`
}

/** Products, lines and collection methods for the order form, usable offline once loaded. */
export function useOrderReferenceData() {
  const owner = useCatalogOwner()
  const products = useProductsList(undefined, {
    query: { queryKey: [...getProductsListQueryKey(), { owner }], ...cached('products', owner) },
  })
  const lines = useProductLinesList(undefined, {
    query: { queryKey: [...getProductLinesListQueryKey(), { owner }], ...cached('product-lines', owner) },
  })
  const methods = useLookupsListCollectionMethods(undefined, { query: cached('collection-methods') })
  useKeepCopy('products', products.data, products.isFetchedAfterMount, owner)
  useKeepCopy('product-lines', lines.data, lines.isFetchedAfterMount, owner)
  useKeepCopy('collection-methods', methods.data, methods.isFetchedAfterMount)
  return { products, lines, methods }
}

/** Towns and specialties for the doctor screens, usable offline once loaded. */
export function useDoctorReferenceData() {
  const towns = useLookupsListTowns({ query: cached('towns') })
  const specialties = useLookupsListSpecialties(undefined, { query: cached('specialties') })
  useKeepCopy('towns', towns.data, towns.isFetchedAfterMount)
  useKeepCopy('specialties', specialties.data, specialties.isFetchedAfterMount)
  return { towns, specialties }
}
