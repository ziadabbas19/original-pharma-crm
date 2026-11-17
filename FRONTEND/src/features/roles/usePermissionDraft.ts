import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { rolesSetPermissions } from '@/api/generated/endpoints'
import type { PermissionGrantDto, PermissionScope, RoleDto } from '@/api/generated/model'
import { invalidateRoleData } from './role-rules'

type Draft = Record<string, Record<string, PermissionScope | null>>

export interface SaveFailure {
  error: unknown
  role: RoleDto
}

function serverScope(role: RoleDto, key: string): PermissionScope | null {
  return role.permissions.find((p) => p.key === key)?.scope ?? null
}

/**
 * Unsaved edits of the permission matrix, per role. Edits stay local until saved; each
 * changed role is then saved as a full set. The API bumps the permissions version of
 * the role's users, so they get the new grants on their next request.
 */
export function usePermissionDraft(roles: RoleDto[] | undefined) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<SaveFailure | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  // Only entries that still differ from the server count as changes.
  const changes = useMemo(() => {
    const byRole = new Map<string, Record<string, PermissionScope | null>>()
    for (const role of roles ?? []) {
      const edits = draft[role.id]
      if (!edits) continue
      const real = Object.fromEntries(
        Object.entries(edits).filter(([key, value]) => value !== serverScope(role, key)),
      )
      if (Object.keys(real).length > 0) byRole.set(role.id, real)
    }
    return byRole
  }, [draft, roles])

  const changeCount = [...changes.values()].reduce((sum, edits) => sum + Object.keys(edits).length, 0)

  // Leaving the page with unsaved permission edits asks first.
  useEffect(() => {
    if (changeCount === 0) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changeCount])

  const valueOf = useCallback(
    (role: RoleDto, key: string): PermissionScope | null => {
      const edits = draft[role.id]
      return edits && key in edits ? edits[key] : serverScope(role, key)
    },
    [draft],
  )

  const setCell = useCallback((role: RoleDto, key: string, value: PermissionScope | null) => {
    setSavedCount(null)
    setDraft((prev) => ({ ...prev, [role.id]: { ...prev[role.id], [key]: value } }))
  }, [])

  /** Replace a role's whole column, e.g. with the grants of another role. */
  const replaceRole = useCallback((role: RoleDto, grants: PermissionGrantDto[]) => {
    setSavedCount(null)
    const keys = new Set([...role.permissions.map((p) => p.key), ...grants.map((g) => g.key)])
    setDraft((prev) => ({
      ...prev,
      [role.id]: Object.fromEntries(
        [...keys].map((key) => [key, grants.find((g) => g.key === key)?.scope ?? null]),
      ),
    }))
  }, [])

  const discard = useCallback((roleId?: string) => {
    setFailure(null)
    setDraft((prev) => {
      if (!roleId) return {}
      const rest = { ...prev }
      delete rest[roleId]
      return rest
    })
  }, [])

  const save = async () => {
    setSaving(true)
    setFailure(null)
    const saved: string[] = []
    try {
      for (const [roleId, edits] of changes) {
        const role = roles?.find((r) => r.id === roleId)
        if (!role) continue
        const merged = new Map<string, PermissionScope>(role.permissions.map((p) => [p.key, p.scope]))
        for (const [key, scope] of Object.entries(edits)) {
          if (scope) merged.set(key, scope)
          else merged.delete(key)
        }
        try {
          await rolesSetPermissions(roleId, {
            permissions: [...merged].map(([key, scope]) => ({ key, scope })),
          })
        } catch (error) {
          setFailure({ error, role })
          break
        }
        saved.push(roleId)
      }
      setSavedCount(saved.length)
    } finally {
      // Drop the edits that reached the server; keep the rest for another try.
      setDraft((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !saved.includes(id))))
      setSaving(false)
      await invalidateRoleData(queryClient)
    }
  }

  return {
    changes,
    changeCount,
    valueOf,
    setCell,
    replaceRole,
    discard,
    save,
    saving,
    failure,
    savedCount,
    isDirty: (roleId: string) => changes.has(roleId),
  }
}

export type PermissionDraft = ReturnType<typeof usePermissionDraft>
