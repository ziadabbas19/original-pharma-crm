/**
 * The "Default daily amounts" section of the rep's expenses screen. Plain functions (no React) so the
 * unit tests run them under Node; runtime imports stay relative.
 */
import type { PermissionScope } from '../../api/generated/model/index.ts'
import { hasPermission, P } from '../../lib/permissions.ts'

/** Only people whose role was given expenses:settings see the section (no default role but Admin has it). */
export function showsCityAmounts(granted: Record<string, PermissionScope>): boolean {
  return hasPermission(granted, P.expenses.settings)
}

export interface TownAmount {
  id: string
  name: string
  nameAr?: string | null
  areaId?: string | null
  areaName?: string | null
  areaNameAr?: string | null
  defaultDailyExpense?: number
}

/** Towns by area, in the order the server lists them (area, then town). */
export function groupTownsByArea<T extends TownAmount>(
  towns: readonly T[],
): { areaId: string; towns: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const town of towns) {
    const key = town.areaId ?? ''
    groups.set(key, [...(groups.get(key) ?? []), town])
  }
  return [...groups.entries()].map(([areaId, list]) => ({ areaId, towns: list }))
}
