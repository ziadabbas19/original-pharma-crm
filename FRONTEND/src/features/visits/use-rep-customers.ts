import { useEffect, useMemo } from 'react'
import { useCustomersList, useDoctorsList } from '@/api/generated/endpoints'
import type { CustomerDto, DoctorDto, DoctorSlotDto } from '@/api/generated/model'
import { readCache, writeCache } from '@/lib/offline-cache'

/** A doctor, pharmacy or AM place the rep can visit, whichever list it came from. */
export interface VisitCustomer {
  id: string
  type: 'doctor' | 'pharmacy' | 'hospital'
  name: string
  nameAr?: string | null
  lat?: number | null
  lng?: number | null
  geofenceRadiusMeters: number
  phone?: string | null
  address?: string | null
  landmark?: string | null
  notes?: string | null
  townId?: string | null
  townName?: string | null
  townNameAr?: string | null
  specialtyNameEn?: string | null
  specialtyNameAr?: string | null
  /** Doctors only. */
  availability?: DoctorSlotDto[] | null
  createdByName?: string | null
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
  address: d.address,
  landmark: d.landmark,
  townId: d.townId,
  townName: d.townName,
  townNameAr: d.townNameAr,
  specialtyNameEn: d.specialtyNameEn,
  specialtyNameAr: d.specialtyNameAr,
  availability: d.availability ?? [],
  createdByName: d.createdByName,
})

/** A pharmacy or an AM place (hospital) from the customer lists. */
export const fromPharmacy = (c: CustomerDto): VisitCustomer => ({
  id: c.id,
  type: c.type === 'hospital' ? 'hospital' : 'pharmacy',
  name: c.name,
  nameAr: c.nameAr,
  lat: c.lat,
  lng: c.lng,
  geofenceRadiusMeters: c.geofenceRadiusMeters,
  phone: c.phone,
  address: c.address,
  landmark: c.landmark,
  notes: c.notes,
  townId: c.territoryId,
  townName: c.territoryName,
  townNameAr: c.territoryNameAr,
})

const PHARMACIES_KEY = 'my-pharmacies'
const PLACES_KEY = 'my-places'
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

/** AM places (hospitals) the rep can see: every town of their area and places on their list. Offline once loaded. */
export function useAmPlaces(options: { enabled?: boolean } = {}) {
  const copy = readCache<CustomerDto[]>(PLACES_KEY)
  const places = useCustomersList(
    { type: 'hospital' },
    {
      query: {
        enabled: options.enabled ?? true,
        initialData: copy?.data,
        initialDataUpdatedAt: copy?.savedAt,
        staleTime: 60_000,
      },
    },
  )
  useEffect(() => {
    if (places.data && places.isFetchedAfterMount) writeCache(PLACES_KEY, places.data)
  }, [places.data, places.isFetchedAfterMount])
  return places
}

/** Everyone the rep can start a visit with: their doctor list, the pharmacies and the AM places of their area. */
export function useRepCustomers() {
  const copy = readCache<DoctorDto[]>(DOCTORS_KEY)
  const doctors = useDoctorsList(
    { Mine: true },
    { query: { initialData: copy?.data, initialDataUpdatedAt: copy?.savedAt, staleTime: 60_000 } },
  )
  const pharmacies = usePharmacies()
  const places = useAmPlaces()
  const customers = useMemo(
    () => [
      ...(doctors.data ?? []).map(fromDoctor),
      ...(pharmacies.data ?? []).map(fromPharmacy),
      ...(places.data ?? []).map(fromPharmacy),
    ],
    [doctors.data, pharmacies.data, places.data],
  )
  return {
    customers,
    doctors: doctors.data,
    pharmacies: pharmacies.data,
    places: places.data,
    isLoading: doctors.isLoading || pharmacies.isLoading,
    error: doctors.error ?? pharmacies.error,
  }
}
