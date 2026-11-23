/** AM place rules of the UI, without React (the unit tests load it under Node). */
import type { CustomerDto, PermissionScope, RepAmPlaceDto } from '../../api/generated/model/index.ts'
import { hasPermission, P } from '../../lib/permissions.ts'

/** AM places are added with the pharmacy right (a rep's area) or with customers:manage (managers). */
export function canAddPlace(granted: Record<string, PermissionScope>): boolean {
  return hasPermission(granted, P.customers.createPharmacy) || hasPermission(granted, P.customers.manage)
}

/** A place picked from the list, as today's AM list shows it until the server answers. */
export function placeOf(place: CustomerDto, position: number): RepAmPlaceDto {
  return {
    customerId: place.id,
    name: place.name,
    nameAr: place.nameAr,
    townId: place.territoryId,
    townName: place.territoryName,
    townNameAr: place.territoryNameAr,
    position,
    plannedTime: null,
  }
}
