import type { PermissionScope } from '@/api/generated/model'
import { bestLevel } from '@/features/roles/role-rules'
import { hasPermission, type PermissionKey } from '@/lib/permissions'
import { useAppSelector } from '@/store'

/** True when the signed-in user holds `key` (optionally with at least `minScope`). */
export function usePermission(key: PermissionKey, minScope?: PermissionScope): boolean {
  const granted = useAppSelector((s) => s.permissions.byKey)
  return hasPermission(granted, key, minScope)
}

/** The scope the user holds for `key`, or null. */
export function usePermissionScope(key: PermissionKey): PermissionScope | null {
  return useAppSelector((s) => s.permissions.byKey[key] ?? null)
}

/** Every permission the signed-in user holds, with its scope. */
export function useGrantedPermissions(): Record<string, PermissionScope> {
  return useAppSelector((s) => s.permissions.byKey)
}

/** The signed-in user's level in the role hierarchy (their best role; lower = more authority). */
export function useMyRoleLevel(): number {
  return useAppSelector((s) => bestLevel(s.auth.user?.roles ?? []))
}

export function useMyUserId(): string | undefined {
  return useAppSelector((s) => s.auth.user?.id)
}
