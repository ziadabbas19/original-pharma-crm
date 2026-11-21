/**
 * The rep's "Add pharmacy" form: values, checks and the request, without React, so the unit tests
 * run them under Node. Runtime imports stay relative.
 */
import type { CreatePharmacyRequest, CustomerDto, PermissionScope } from '../../api/generated/model/index.ts'
import { hasPermission, P } from '../../lib/permissions.ts'

export interface PharmacyFormValues {
  name: string
  nameAr: string
  townId: string
  address: string
  phone: string
  notes: string
}

export const EMPTY_PHARMACY: PharmacyFormValues = {
  name: '',
  nameAr: '',
  townId: '',
  address: '',
  phone: '',
  notes: '',
}

/** Same limits as the managers' pharmacy form and the server. */
export const PHARMACY_LIMITS = { name: 200, address: 500, phone: 32, notes: 1000 } as const

/** Only people given customers:create-pharmacy (the rep role by default) see "Add pharmacy". */
export function canAddPharmacy(granted: Record<string, PermissionScope>): boolean {
  return hasPermission(granted, P.customers.createPharmacy)
}

/** What still has to be filled in: a name and a town. */
export function pharmacyProblems(values: PharmacyFormValues): { name?: 'required'; townId?: 'required' } {
  return {
    name: values.name.trim() === '' ? 'required' : undefined,
    townId: values.townId === '' ? 'required' : undefined,
  }
}

export function toCreatePharmacyRequest(values: PharmacyFormValues): CreatePharmacyRequest {
  const optional = (value: string) => value.trim() || null
  return {
    name: values.name.trim(),
    nameAr: optional(values.nameAr),
    territoryId: values.townId,
    address: optional(values.address),
    phone: optional(values.phone),
    notes: optional(values.notes),
  }
}

/** The rep's pharmacy list with a new one in it, by name like the server sorts it. */
export function withPharmacy(list: readonly CustomerDto[] | undefined, added: CustomerDto): CustomerDto[] {
  return [...(list ?? []).filter((p) => p.id !== added.id), added].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}
