import { useEffect, useMemo } from 'react'
import { useCustomersList, useDoctorsList } from '@/api/generated/endpoints'
import type { CustomerDto, DoctorDto } from '@/api/generated/model'
import { readCache, writeCache } from '@/lib/offline-cache'

/** A doctor or pharmacy the rep can visit, whichever list it came from. */
export interface VisitCustomer {
  id: string
  type: 'doctor' | 'pharmacy'
  name: string
  nameAr?: string | null
  lat?: number | null
  lng?: number | null
  geofenceRadiusMeters: number
  phone?: string | null
  address?: string | null
  notes?: string | null
  townName?: string | null
  townNameAr?: string | null
  specialtyNameEn?: string | null
  specialtyNameAr?: string | null
}

export const fromDoctor = (d: DoctorDto): VisitCustomer => ({
  id: d.id,
  type: 'doctor',
  name: d.name,
  nameAr: d.nameAr,
  lat: d.lat,
  lng: d.lng,
  geofenceRadiusMeters: d.geofenceRadiusMeters ?? 150,
  phone: d.phone,
  notes: d.notes,
  townName: d.townName,
  townNameAr: d.townNameAr,
  specialtyNameEn: d.specialtyNameEn,
  specialtyNameAr: d.specialtyNameAr,
})

export const fromPharmacy = (c: CustomerDto): VisitCustomer => ({
  id: c.id,
  type: 'pharmacy',
  name: c.name,
  nameAr: c.nameAr,
  lat: c.lat,
  lng: c.lng,
  geofenceRadiusMeters: c.geofenceRadiusMeters,
  phone: c.phone,
  address: c.address,
  notes: c.notes,
  townName: c.territoryName,
  townNameAr: c.territoryNameAr,
})

const PHARMACIES_KEY = 'my-pharmacies'
const DOCTORS_KEY = 'my-doctors'

/** Pharmacies in the rep's area, usable offline once loaded. */
export function usePharmacies() {
  const copy = readCache<CustomerDto[]>(PHARMACIES_KEY)
  const pharmacies = useCustomersList(
    { type: 'pharmacy' },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 60_000 } },
  )
  useEffect(() => {
    if (pharmacies.data && pharmacies.isFetchedAfterMount) writeCache(PHARMACIES_KEY, pharmacies.data)
  }, [pharmacies.data, pharmacies.isFetchedAfterMount])
  return pharmacies
}

/** Everyone the rep can start a visit with: their doctor list and the pharmacies in their area. */
export function useRepCustomers() {
  const copy = readCache<DoctorDto[]>(DOCTORS_KEY)
  const doctors = useDoctorsList(
    { Mine: true },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 60_000 } },
  )
  const pharmacies = usePharmacies()
  const customers = useMemo(
    () => [...(doctors.data ?? []).map(fromDoctor), ...(pharmacies.data ?? []).map(fromPharmacy)],
    [doctors.data, pharmacies.data],
  )
  return {
    customers,
    isLoading: doctors.isLoading || pharmacies.isLoading,
    error: doctors.error ?? pharmacies.error,
  }
}
