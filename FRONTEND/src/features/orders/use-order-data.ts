import { useEffect } from 'react'
import {
  useLookupsListCollectionMethods,
  useLookupsListSpecialties,
  useLookupsListTowns,
  useProductLinesList,
  useProductsList,
} from '@/api/generated/endpoints'
import { readCache, writeCache } from '@/lib/offline-cache'

const STALE = 5 * 60_000

/** Query options that start from the device copy (offline) and refresh it on every success. */
function cached<T>(key: string) {
  const copy = readCache<T>(key)
  return {
    staleTime: STALE,
    initialData: copy?.data,
    initialDataUpdatedAt: copy?.savedAt,
  }
}

function useKeepCopy<T>(key: string, data: T | undefined, isFetchedAfterMount: boolean) {
  useEffect(() => {
    if (data !== undefined && isFetchedAfterMount) writeCache(key, data)
  }, [key, data, isFetchedAfterMount])
}

/** Products, lines and collection methods for the order form, usable offline once loaded. */
export function useOrderReferenceData() {
  const products = useProductsList(undefined, { query: cached('products') })
  const lines = useProductLinesList(undefined, { query: cached('product-lines') })
  const methods = useLookupsListCollectionMethods(undefined, { query: cached('collection-methods') })
  useKeepCopy('products', products.data, products.isFetchedAfterMount)
  useKeepCopy('product-lines', lines.data, lines.isFetchedAfterMount)
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
