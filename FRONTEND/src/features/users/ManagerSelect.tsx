import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { UserListItemDto } from '@/api/generated/model'
import { NativeSelect } from '@/components/ui/native-select'
import { bestLevel, reportsOf, roleName } from '@/features/roles/role-rules'

/**
 * Manager picker. A manager must hold a role with a lower level number than the user
 * (`userLevel`), and cannot be someone who already reports to the user (a loop); such
 * people are listed but disabled with the reason.
 */
export function ManagerSelect({
  id,
  value,
  onChange,
  users,
  userId,
  userLevel,
  invalid,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  users: UserListItemDto[]
  /** The user being edited (excluded, and their reports are blocked). */
  userId?: string
  userLevel: number
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const reports = useMemo(() => (userId ? reportsOf(users, userId) : new Set<string>()), [users, userId])
  const candidates = useMemo(
    () => users.filter((u) => u.id !== userId && (u.isActive || u.id === value)),
    [users, userId, value],
  )

  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
      <option value="">{t('users.create.noManager')}</option>
      {candidates.map((user) => {
        const level = bestLevel(user.roles)
        const reason = reports.has(user.id)
          ? t('users.reporting.reportsToUser')
          : level >= userLevel
            ? t('users.reporting.doesNotOutrank')
            : null
        const topRole = user.roles[0]
        const label = topRole ? `${user.fullName} · ${roleName(topRole)}` : user.fullName
        return (
          <option key={user.id} value={user.id} disabled={reason !== null && user.id !== value}>
            {reason ? t('roles.optionLocked', { role: label, reason }) : label}
          </option>
        )
      })}
    </NativeSelect>
  )
}
