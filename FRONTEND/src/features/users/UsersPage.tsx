import { KeyRoundIcon, PencilIcon, PlusIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRolesList, useTerritoriesList, useUsersList } from '@/api/generated/endpoints'
import type { RoleSummaryDto, TerritoryDto, UserListItemDto } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useMyRoleLevel, useMyUserId, usePermission } from '@/features/auth/usePermission'
import { roleName, userLock } from '@/features/roles/role-rules'
import { formatNumber, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { CreateUserDialog } from './CreateUserDialog'
import { EditUserDialog } from './EditUserDialog'
import { UserOverridesSheet } from './UserOverridesSheet'
import { UserRolesDialog } from './UserRolesDialog'

const column = dataTableColumns<UserListItemDto>()
const NO_TERRITORIES: TerritoryDto[] = []
type StatusFilter = 'all' | 'active' | 'inactive'

export function UsersPage() {
  const { t } = useTranslation()
  const canManage = usePermission(P.users.manage)
  const canReadRoles = usePermission(P.roles.read)
  const canReadTerritories = usePermission(P.territories.read)
  const myId = useMyUserId()
  const myLevel = useMyRoleLevel()

  const users = useUsersList()
  const roles = useRolesList({ query: { enabled: canReadRoles } })
  const territories = useTerritoriesList({ query: { enabled: canManage && canReadTerritories } })

  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserListItemDto | null>(null)
  const [rolesFor, setRolesFor] = useState<UserListItemDto | null>(null)
  const [overridesFor, setOverridesFor] = useState<UserListItemDto | null>(null)

  // Filter options: every role when roles are readable, otherwise the roles seen on the users.
  const roleOptions = useMemo<RoleSummaryDto[]>(() => {
    if (roles.data) return roles.data
    const byKey = new Map((users.data ?? []).flatMap((u) => u.roles).map((r) => [r.key, r]))
    return [...byKey.values()].toSorted((a, b) => a.level - b.level)
  }, [roles.data, users.data])

  const filtered = useMemo(() => {
    if (!users.data) return undefined
    const q = search.trim().toLowerCase()
    return users.data.filter(
      (u) =>
        (!q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (!role || u.roles.some((r) => r.key === role)) &&
        (status === 'all' || (status === 'active') === u.isActive),
    )
  }, [users.data, search, role, status])

  const isFiltered = search !== '' || role !== '' || status !== 'all'
  const clearFilters = () => {
    setSearch('')
    setRole('')
    setStatus('all')
  }

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('fullName', {
          header: () => t('users.name'),
          cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        column.accessor('email', {
          header: () => t('users.email'),
          cell: (info) => (
            <span dir="ltr" className="text-muted-foreground">
              {info.getValue()}
            </span>
          ),
          meta: { className: 'hidden md:table-cell' },
        }),
        column.accessor('roles', {
          header: () => t('users.roles'),
          enableSorting: false,
          cell: (info) => (
            <div className="flex flex-wrap gap-1">
              {info.getValue().map((r) => (
                <Badge
                  key={r.key}
                  variant="secondary"
                  title={t('roles.level', { level: formatNumber(r.level) })}
                >
                  {roleName(r)}
                </Badge>
              ))}
            </div>
          ),
        }),
        column.accessor('managerName', {
          header: () => t('users.manager'),
          cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
          meta: { className: 'hidden xl:table-cell' },
        }),
        column.accessor((u) => localizedName(u.territoryName, u.territoryNameAr), {
          id: 'territory',
          header: () => t('users.territory'),
          cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
          meta: { className: 'hidden lg:table-cell' },
        }),
        column.accessor('isActive', {
          header: () => t('users.status'),
          cell: (info) =>
            info.getValue() ? (
              <Badge variant="success">{t('users.active')}</Badge>
            ) : (
              <Badge variant="outline">{t('users.inactive')}</Badge>
            ),
        }),
        column.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('table.actions')}</span>,
          cell: ({ row }) => {
            const lock = userLock(row.original, myId, myLevel)
            const reason = lock ? t(`roles.reason.${lock}`) : undefined
            return (
              <div className="flex justify-end gap-1">
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={lock !== null}
                    title={reason ?? t('users.actions.edit')}
                    aria-label={t('users.actions.edit')}
                    onClick={() => setEditing(row.original)}
                  >
                    <PencilIcon />
                    <span className="hidden 2xl:inline">{t('users.actions.edit')}</span>
                  </Button>
                )}
                {canManage && canReadRoles && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={lock !== null}
                    title={reason ?? t('users.actions.roles')}
                    aria-label={t('users.actions.roles')}
                    onClick={() => setRolesFor(row.original)}
                  >
                    <ShieldCheckIcon />
                    <span className="hidden 2xl:inline">{t('users.actions.roles')}</span>
                  </Button>
                )}
                {canReadRoles && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={t('users.actions.overrides')}
                    aria-label={t('users.actions.overrides')}
                    onClick={() => setOverridesFor(row.original)}
                  >
                    <KeyRoundIcon />
                    <span className="hidden 2xl:inline">{t('users.actions.overrides')}</span>
                  </Button>
                )}
              </div>
            )
          },
        }),
      ]),
    [t, canManage, canReadRoles, myId, myLevel],
  )

  return (
    <>
      <PageHeader
        title={t('users.title')}
        description={t('users.hint')}
        actions={
          canManage &&
          canReadRoles && (
            <Button onClick={() => setCreating(true)} disabled={!roles.data || !users.data}>
              <PlusIcon />
              {t('users.create.title')}
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={users.isLoading}
        error={users.error}
        onRetry={() => void users.refetch()}
        getRowId={(u) => u.id}
        initialSorting={[{ id: 'fullName', desc: false }]}
        filtered={isFiltered}
        onClearFilters={clearFilters}
        empty={{ icon: UsersIcon, title: t('users.empty') }}
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('users.searchPlaceholder')} />
            <FilterField label={t('users.roles')}>
              {(id) => (
                <NativeSelect id={id} className="w-40" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">{t('table.all')}</option>
                  {roleOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {roleName(option)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField label={t('users.status')}>
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusFilter)}
                >
                  <option value="all">{t('table.all')}</option>
                  <option value="active">{t('users.active')}</option>
                  <option value="inactive">{t('users.inactive')}</option>
                </NativeSelect>
              )}
            </FilterField>
            <ToolbarSpacer />
          </>
        }
      />

      {canManage && roles.data && users.data && (
        <CreateUserDialog
          open={creating}
          onOpenChange={setCreating}
          roles={roles.data}
          territories={territories.data ?? NO_TERRITORIES}
          users={users.data}
        />
      )}
      {editing && users.data && (
        <EditUserDialog
          key={editing.id}
          user={editing}
          users={users.data}
          territories={territories.data ?? NO_TERRITORIES}
          onClose={() => setEditing(null)}
        />
      )}
      {rolesFor && roles.data && users.data && (
        <UserRolesDialog
          key={rolesFor.id}
          user={rolesFor}
          roles={roles.data}
          users={users.data}
          onClose={() => setRolesFor(null)}
        />
      )}
      {overridesFor && (
        <UserOverridesSheet
          key={overridesFor.id}
          user={overridesFor}
          roles={roles.data ?? []}
          onClose={() => setOverridesFor(null)}
        />
      )}
    </>
  )
}
