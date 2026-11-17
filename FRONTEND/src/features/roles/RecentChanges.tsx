import { ArrowRightLeftIcon, HistoryIcon, KeyRoundIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRolesGetAudit } from '@/api/generated/endpoints'
import type {
  PermissionDto,
  PermissionScope,
  RoleAuditAction,
  RoleAuditChangeDto,
  RoleAuditEntryDto,
  RoleDto,
} from '@/api/generated/model'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useNow } from '@/hooks/use-now'
import { formatDateTime, formatNumber, formatPercent, formatRelative, localizedName } from '@/lib/format'
import { permissionLabel } from './permission-labels'
import { roleName } from './role-rules'

const ACTION_ICONS: Record<RoleAuditAction, typeof PlusIcon> = {
  created: PlusIcon,
  updated: PencilIcon,
  permissionsChanged: KeyRoundIcon,
  deleted: Trash2Icon,
  usersReassigned: ArrowRightLeftIcon,
}

const VISIBLE_CHANGES = 4

/** The latest changes of one role, from the audit trail (who, when, before/after). */
export function RecentChanges({
  role,
  roles,
  permissions,
}: {
  role: RoleDto
  roles: RoleDto[]
  permissions: PermissionDto[]
}) {
  const { t } = useTranslation()
  const audit = useRolesGetAudit(role.id, { limit: 10 })

  return (
    <Card className="min-w-0 gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
          {t('roles.audit.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {audit.error && !audit.data ? (
          <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
        ) : audit.isLoading ? (
          <LoadingState rows={3} />
        ) : !audit.data?.length ? (
          <EmptyState icon={HistoryIcon} title={t('roles.audit.empty')} className="py-6" />
        ) : (
          <ol className="space-y-4">
            {audit.data.map((entry) => (
              <AuditEntry key={entry.id} entry={entry} roles={roles} permissions={permissions} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function AuditEntry({
  entry,
  roles,
  permissions,
}: {
  entry: RoleAuditEntryDto
  roles: RoleDto[]
  permissions: PermissionDto[]
}) {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const [expanded, setExpanded] = useState(false)
  const Icon = ACTION_ICONS[entry.action]

  // Current name when the role still exists, else the names saved with the entry.
  const nameOfKey = (key: string | null | undefined, savedNames?: string) => {
    const role = roles.find((r) => r.key === key)
    return role ? roleName(role) : (savedNames ?? key ?? '—')
  }

  const lines = describe(entry, nameOfKey, (key) =>
    permissionLabel(t, key, permissions.find((p) => p.key === key)?.description),
  )
  const visible = expanded ? lines : lines.slice(0, VISIBLE_CHANGES)

  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{t(`roles.audit.action.${entry.action}`)}</p>
        <p className="text-xs text-muted-foreground">
          {entry.actorName || t('roles.audit.unknownActor')} ·{' '}
          <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
            {formatRelative(entry.createdAt, now)}
          </time>
        </p>
        {visible.length > 0 && (
          <ul className="space-y-0.5 text-xs">
            {visible.map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        )}
        {lines.length > VISIBLE_CHANGES && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? t('roles.audit.showLess')
              : t('roles.audit.showMore', { count: formatNumber(lines.length - VISIBLE_CHANGES) })}
          </Button>
        )}
      </div>
    </li>
  )

  function describe(
    item: RoleAuditEntryDto,
    roleNameOf: (key: string | null | undefined, savedNames?: string) => string,
    labelOf: (permissionKey: string) => string,
  ): string[] {
    const scope = (value: string | null | undefined) =>
      value ? t(`roles.scope.${value as PermissionScope}`) : t('roles.matrix.none')
    const pair = (
      field: string,
      change: RoleAuditChangeDto,
      format: (v: string | null | undefined) => string,
    ) =>
      change.before == null
        ? t('roles.audit.set', { field, value: format(change.after) })
        : change.after == null
          ? t('roles.audit.set', { field, value: format(change.before) })
          : t('roles.audit.change', { field, before: format(change.before), after: format(change.after) })
    const plain = (value: string | null | undefined) => value ?? '—'
    const count = item.changes.find((c) => c.field === 'userCount')?.after ?? '0'
    const saved = (field: string) => {
      const names = item.changes.find((c) => c.field === field)
      return names ? localizedName(names.after, names.before) : undefined
    }

    const result: string[] = []
    for (const change of item.changes) {
      if (change.field.startsWith('permission:')) {
        const key = change.field.slice('permission:'.length)
        result.push(
          t('roles.audit.change', {
            field: labelOf(key),
            before: scope(change.before),
            after: scope(change.after),
          }),
        )
      } else if (change.field === 'copiedFrom') {
        result.push(t('roles.audit.copiedFrom', { role: roleNameOf(change.after, saved('copiedFromName')) }))
      } else if (change.field === 'reassign') {
        result.push(
          change.before === item.roleKey
            ? t('roles.audit.movedTo', {
                role: roleNameOf(change.after, saved('targetName')),
                count: formatNumber(Number(count)),
              })
            : t('roles.audit.movedFrom', {
                role: roleNameOf(change.before, saved('sourceName')),
                count: formatNumber(Number(count)),
              }),
        )
      } else if (change.field === 'level') {
        result.push(pair(t('roles.form.level'), change, (v) => (v == null ? '—' : formatNumber(Number(v)))))
      } else if (change.field === 'maxDiscountPercent') {
        result.push(
          pair(t('roles.form.maxDiscount'), change, (v) =>
            v == null ? t('roles.form.noCap') : formatPercent(Number(v)),
          ),
        )
      } else if (change.field === 'nameAr' || change.field === 'nameEn' || change.field === 'description') {
        result.push(pair(t(`roles.audit.field.${change.field}`), change, plain))
      }
    }
    return result
  }
}
