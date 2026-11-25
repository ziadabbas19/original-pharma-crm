import { useQueryClient } from '@tanstack/react-query'
import {
  KeyRoundIcon,
  LockKeyholeOpenIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useRolesList,
  usersBulkDelete,
  usersBulkRestore,
  useTerritoriesList,
  useUsersAssignableRoles,
  useUsersList,
} from '@/api/generated/endpoints'
import type { RoleSummaryDto, TerritoryDto, UserListItemDto } from '@/api/generated/model'
import { ArchivedBadge, ArchivedToggle, RestoreSelectedButton } from '@/components/bulk/ArchiveControls'
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog'
import { useBulkRunner, useDeleteTarget } from '@/components/bulk/use-bulk-delete'
import { useSelection } from '@/components/bulk/use-selection'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/UserAvatar'
import { NativeSelect } from '@/components/ui/native-select'
import { useMyRoleLevel, useMyUserId, usePermission } from '@/features/auth/usePermission'
import { roleName, userLock } from '@/features/roles/role-rules'
import { formatNumber, localizedName } from '@/lib/format'
import { P } from '@/lib/permissions'
import { CreateUserDialog } from './CreateUserDialog'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { EditUserDialog } from './EditUserDialog'
import { UserOverridesSheet } from './UserOverridesSheet'
import { UserRolesDialog } from './UserRolesDialog'

const column = dataTableColumns<UserListItemDto>()
const userId = (u: UserListItemDto) => u.id
const NO_TERRITORIES: TerritoryDto[] = []
type StatusFilter = 'all' | 'active' | 'inactive'

export function UsersPage() {
  const { t } = useTranslation()
  const canManage = usePermission(P.users.manage)
  const canCreate = usePermission(P.users.create)
  const canReset = usePermission(P.users.resetPassword)
  const canReadRoles = usePermission(P.roles.read)
  const canReadTerritories = usePermission(P.territories.read)
  const canDelete = usePermission(P.users.delete)
  const canRestore = usePermission(P.users.restore)
  const myId = useMyUserId()
  const myLevel = useMyRoleLevel()
  const queryClient = useQueryClient()
  const [archived, setArchived] = useState(false)

  const users = useUsersList({ archived })
  const roles = useRolesList({ query: { enabled: canReadRoles } })
  const territories = useTerritoriesList(undefined, {
    query: { enabled: (canManage || canCreate) && canReadTerritories },
  })
  // Without roles:read the create dialog offers the roles below the creator.
  const assignable = useUsersAssignableRoles({ query: { enabled: canCreate && !canReadRoles } })
  const createRoles = canReadRoles ? roles.data : assignable.data

  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserListItemDto | null>(null)
  const [rolesFor, setRolesFor] = useState<UserListItemDto | null>(null)
  const [overridesFor, setOverridesFor] = useState<UserListItemDto | null>(null)
  const [resetFor, setResetFor] = useState<UserListItemDto | null>(null)

  // Filter options: every role when roles are readable, otherwise the roles seen on the users.
  const roleOptions = useMemo<RoleSummaryDto[]>(() => {
    if (roles.data) return roles.data
    const byKey = new Map((users.data ?? []).flatMap((u) => u.roles).map((r) => [r.key, r]))
    return [...byKey.values()].toSorted((a, b) => a.level - b.level)
  }, [roles.data, users.data])
  const selectedRole = roleOptions.find((o) => o.key === role)

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

  const selection = useSelection(filtered, userId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(usersBulkDelete, ['/api/users', '/api/roles'], selection)
  const nameOf = (id: string) => users.data?.find((u) => u.id === id)?.fullName ?? id

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
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <UserAvatar name={row.original.fullName} src={row.original.avatarUrl} />
              <div className="min-w-0">
                <span className="font-medium">{row.original.fullName}</span>
                {row.original.mustChangePassword && (
                  <div className="text-xs text-muted-foreground">{t('users.temporaryPassword')}</div>
                )}
              </div>
            </div>
          ),
        }),
        column.accessor('email', {
          header: () => t('users.email'),
          cell: (info) => (
            <span dir="ltr" className="text-muted-foreground">
              {info.getValue()}
            </span>
          ),
          meta: { className: 'hidden @[58rem]:table-cell' },
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
          meta: { className: 'hidden @[40rem]:table-cell' },
        }),
        column.accessor('managerName', {
          header: () => t('users.manager'),
          cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
          meta: { className: 'hidden @[76rem]:table-cell' },
        }),
        column.accessor((u) => localizedName(u.territoryName, u.territoryNameAr), {
          id: 'territory',
          header: () => t('users.area'),
          cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
          meta: { className: 'hidden @[65rem]:table-cell' },
        }),
        column.accessor('isActive', {
          header: () => t('users.status'),
          cell: ({ row }) =>
            row.original.archivedAt ? (
              <ArchivedBadge />
            ) : row.original.isActive ? (
              <Badge variant="success">{t('users.active')}</Badge>
            ) : (
              <Badge variant="outline">{t('users.inactive')}</Badge>
            ),
          meta: { className: 'hidden @[44.5rem]:table-cell' },
        }),
        column.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('table.actions')}</span>,
          cell: ({ row }) => {
            const lock = userLock(row.original, myId, myLevel)
            const reason = lock ? t(`roles.reason.${lock}`) : undefined
            if (row.original.archivedAt) return null
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
                    <span className="hidden @[100rem]:inline">{t('users.actions.edit')}</span>
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
                    <span className="hidden @[100rem]:inline">{t('users.actions.roles')}</span>
                  </Button>
                )}
                {canReset && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={lock !== null}
                    title={reason ?? t('users.actions.resetPassword')}
                    aria-label={t('users.actions.resetPassword')}
                    onClick={() => setResetFor(row.original)}
                  >
                    <LockKeyholeOpenIcon />
                    <span className="hidden @[100rem]:inline">{t('users.actions.resetPassword')}</span>
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
                    <span className="hidden @[100rem]:inline">{t('users.actions.overrides')}</span>
                  </Button>
                )}
                {canDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={lock !== null}
                    title={reason ?? t('common.delete')}
                    aria-label={t('common.delete')}
                    onClick={() => target.open([row.original.id])}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            )
          },
        }),
      ]),
    [t, canManage, canReadRoles, canReset, canDelete, myId, myLevel, target],
  )

  return (
    <>
      <PageHeader
        title={t('users.title')}
        description={t('users.hint')}
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)} disabled={!createRoles || !users.data}>
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
        onRowClick={
          canManage
            ? (u) => {
                if (!u.archivedAt && userLock(u, myId, myLevel) === null) setEditing(u)
              }
            : undefined
        }
        initialSorting={[{ id: 'fullName', desc: false }]}
        filtered={isFiltered}
        onClearFilters={clearFilters}
        empty={{ icon: UsersIcon, title: archived ? t('archive.empty') : t('users.empty') }}
        selection={(archived ? canRestore : canDelete) ? selection : undefined}
        rowLabel={(u) => u.fullName}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={(ids) => usersBulkRestore({ ids })}
              onDone={() => void queryClient.invalidateQueries({ queryKey: ['/api/users'] })}
            />
          ) : (
            <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
              <Trash2Icon />
              {t('bulk.deleteSelected')}
            </Button>
          )
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('users.searchPlaceholder')} />
            <FilterField
              label={t('users.roles')}
              active={role !== ''}
              display={selectedRole ? roleName(selectedRole) : undefined}
              onReset={() => setRole('')}
            >
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
            <FilterField
              label={t('users.status')}
              active={status !== 'all'}
              display={status === 'all' ? undefined : t(`users.${status}`)}
              onReset={() => setStatus('all')}
            >
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
            {(canDelete || canRestore) && (
              <ArchivedToggle
                archived={archived}
                onChange={(value) => {
                  selection.clear()
                  setArchived(value)
                }}
              />
            )}
          </>
        }
      />

      {canCreate && createRoles && users.data && (
        <CreateUserDialog
          open={creating}
          onOpenChange={setCreating}
          roles={createRoles}
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
      {resetFor && (
        <ResetPasswordDialog key={resetFor.id} user={resetFor} onClose={() => setResetFor(null)} />
      )}
      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={nameOf}
          dangerous
          consequence={t('users.deleteConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
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
