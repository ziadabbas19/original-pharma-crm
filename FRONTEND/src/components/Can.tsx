import type { ReactNode } from 'react'
import type { PermissionScope } from '@/api/generated/model'
import { usePermission } from '@/features/auth/usePermission'
import type { PermissionKey } from '@/lib/permissions'

interface CanProps {
  permission: PermissionKey
  minScope?: PermissionScope
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Renders children only when the user holds the permission.
 * UI convenience only; the API enforces every permission and scope.
 *
 * @example <Can permission="roles:manage"><EditButton /></Can>
 */
export function Can({ permission, minScope, children, fallback = null }: CanProps) {
  return usePermission(permission, minScope) ? children : fallback
}
