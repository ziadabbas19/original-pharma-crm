import { useQueryClient } from '@tanstack/react-query'
import { CornerDownLeftIcon, MapPinnedIcon, PencilIcon, PlusIcon, Trash2Icon, WalletIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { territoriesBulkDelete, territoriesBulkRestore, useTerritoriesList } from '@/api/generated/endpoints'
import type { TerritoryDto, TerritoryLevel } from '@/api/generated/model'
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
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission, usePermissionScope } from '@/features/auth/usePermission'
import { formatMoney, formatNumber, localizedName } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { P } from '@/lib/permissions'
import { CityExpenseDialog } from './CityExpenseDialog'
import { TerritoryDialog } from './TerritoryDialog'
import { flattenTerritories, type TerritoryNode } from './territory-tree'

const column = dataTableColumns<TerritoryNode>()
const LEVELS: TerritoryLevel[] = ['region', 'area', 'town']
const LEVEL_BADGE: Record<TerritoryLevel, 'default' | 'secondary' | 'outline'> = {
  region: 'default',
  area: 'secondary',
  town: 'outline',
}
const CHILD_LEVEL: Partial<Record<TerritoryLevel, TerritoryLevel>> = { region: 'area', area: 'town' }

const nodeId = (n: TerritoryNode) => n.id

interface Editing {
  territory: TerritoryDto | null
  level: TerritoryLevel
  parentId?: string
}

export function TerritoriesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [archived, setArchived] = useState(false)
  const territories = useTerritoriesList({ archived })
  const canManage = usePermission(P.territories.manage)
  const canDelete = usePermission(P.territories.delete)
  const canRestore = usePermission(P.territories.restore)
  const manageAll = usePermissionScope(P.territories.manage) === 'all'
  const canSetExpense = usePermission(P.expenses.settings)
  const [expenseOf, setExpenseOf] = useState<TerritoryDto | null>(null)
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState<'' | TerritoryLevel>('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const target = useDeleteTarget()

  const nodes = useMemo(
    () => (territories.data ? flattenTerritories(territories.data) : undefined),
    [territories.data],
  )
  const byId = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes])
  const nameOf = (id: string) => {
    const node = byId.get(id)
    return node ? localizedName(node.name, node.nameAr) : id
  }

  const filtered = useMemo(() => {
    if (!nodes) return undefined
    const q = search.trim().toLowerCase()
    return nodes.filter(
      (n) =>
        (!level || n.level === level) &&
        (!q ||
          n.name.toLowerCase().includes(q) ||
          (n.nameAr ?? '').includes(q) ||
          n.code.toLowerCase().includes(q)),
    )
  }, [nodes, search, level])

  const selection = useSelection(filtered, nodeId)
  const bulk = useBulkRunner(
    territoriesBulkDelete,
    ['/api/territories', '/api/lookups', '/api/doctors'],
    selection,
  )

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor((n) => localizedName(n.name, n.nameAr), {
          id: 'name',
          header: () => t('territories.name'),
          enableSorting: false,
          cell: ({ row }) => {
            const n = row.original
            const other = localizedName(n.name, n.nameAr) === n.name ? n.nameAr : n.name
            return (
              <div className="flex items-center gap-2" style={{ paddingInlineStart: `${n.depth * 1.25}rem` }}>
                {n.depth > 0 && (
                  <CornerDownLeftIcon
                    className="size-3.5 shrink-0 text-muted-foreground ltr:-scale-x-100"
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{localizedName(n.name, n.nameAr)}</div>
                  {other && <div className="text-xs text-muted-foreground">{other}</div>}
                </div>
              </div>
            )
          },
        }),
        column.accessor('code', {
          header: () => t('territories.code'),
          cell: (info) => (
            <span dir="ltr" className="font-mono text-xs">
              {info.getValue()}
            </span>
          ),
          meta: { className: 'hidden @[51rem]:table-cell' },
        }),
        column.accessor('level', {
          header: () => t('territories.level'),
          cell: (info) => (
            <Badge variant={LEVEL_BADGE[info.getValue()]}>{t(`territories.levels.${info.getValue()}`)}</Badge>
          ),
          meta: { className: 'hidden @[32rem]:table-cell' },
        }),
        column.accessor(
          (n) => (n.parentId ? localizedName(byId.get(n.parentId)?.name, byId.get(n.parentId)?.nameAr) : ''),
          {
            id: 'parent',
            header: () => t('territories.parent'),
            cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
            meta: { className: 'hidden @[60rem]:table-cell' },
          },
        ),
        column.accessor('userCount', {
          header: () => t('territories.users'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
          meta: { className: 'hidden @[39rem]:table-cell' },
        }),
        column.accessor('customerCount', {
          header: () => t('territories.customers'),
          cell: ({ row }) =>
            row.original.archivedAt ? (
              <ArchivedBadge />
            ) : (
              <span className="tabular-nums">{formatNumber(row.original.customerCount)}</span>
            ),
          meta: { className: 'hidden @[44.5rem]:table-cell' },
        }),
        column.accessor('defaultDailyExpense', {
          header: () => t('territories.dailyExpense'),
          cell: ({ row }) =>
            row.original.level === 'town' ? (
              <span className="tabular-nums" data-testid="town-expense">
                {(row.original.defaultDailyExpense ?? 0) > 0
                  ? formatMoney(row.original.defaultDailyExpense ?? 0)
                  : '—'}
              </span>
            ) : null,
          meta: { className: 'text-end' },
        }),
        ...((canManage || canDelete || canSetExpense) && !archived
          ? [
              column.display({
                id: 'actions',
                header: () => <span className="sr-only">{t('table.actions')}</span>,
                cell: ({ row }) => {
                  const node = row.original
                  const child = CHILD_LEVEL[node.level]
                  return (
                    <div className="flex justify-end gap-1">
                      {canSetExpense && node.level === 'town' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t('territories.setDailyExpense')}
                          aria-label={t('territories.setDailyExpense')}
                          onClick={() => setExpenseOf(node)}
                          data-testid="set-town-expense"
                        >
                          <WalletIcon />
                          <span className="hidden @[80rem]:inline">{t('territories.setDailyExpense')}</span>
                        </Button>
                      )}
                      {canManage && child && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t(`territories.add.${child}`)}
                          aria-label={t(`territories.add.${child}`)}
                          onClick={() => setEditing({ territory: null, level: child, parentId: node.id })}
                        >
                          <PlusIcon />
                          <span className="hidden @[68rem]:inline">{t(`territories.add.${child}`)}</span>
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t('territories.edit')}
                          onClick={() => setEditing({ territory: node, level: node.level })}
                        >
                          <PencilIcon />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          title={t('territories.delete')}
                          aria-label={t('territories.delete')}
                          onClick={() => target.open([node.id])}
                        >
                          <Trash2Icon />
                        </Button>
                      )}
                    </div>
                  )
                },
              }),
            ]
          : []),
      ]),
    [t, byId, canManage, canDelete, canSetExpense, archived, target],
  )

  return (
    <>
      <PageHeader
        title={t('territories.title')}
        description={t('territories.hint')}
        actions={
          canManage &&
          !archived && (
            <div className="flex flex-wrap gap-2">
              {manageAll && (
                <Button variant="outline" onClick={() => setEditing({ territory: null, level: 'region' })}>
                  <PlusIcon />
                  {t('territories.add.region')}
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditing({ territory: null, level: 'area' })}>
                <PlusIcon />
                {t('territories.add.area')}
              </Button>
              <Button onClick={() => setEditing({ territory: null, level: 'town' })}>
                <PlusIcon />
                {t('territories.add.town')}
              </Button>
            </div>
          )
        }
      />
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={territories.isLoading}
        error={territories.error}
        onRetry={() => void territories.refetch()}
        getRowId={(n) => n.id}
        pageSize={50}
        filtered={search !== '' || level !== ''}
        onClearFilters={() => {
          setSearch('')
          setLevel('')
        }}
        empty={{ icon: MapPinnedIcon, title: archived ? t('archive.empty') : t('territories.empty') }}
        selection={(archived ? canRestore : canDelete) ? selection : undefined}
        rowLabel={(n) => localizedName(n.name, n.nameAr)}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={(ids) => territoriesBulkRestore({ ids })}
              onDone={() => void invalidateApi(queryClient, '/api/territories', '/api/lookups')}
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
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('territories.searchPlaceholder')}
            />
            <FilterField
              label={t('territories.level')}
              active={level !== ''}
              display={level ? t(`territories.levels.${level}`) : undefined}
              onReset={() => setLevel('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={level}
                  onChange={(e) => setLevel(e.target.value as '' | TerritoryLevel)}
                >
                  <option value="">{t('table.all')}</option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {t(`territories.levels.${l}`)}
                    </option>
                  ))}
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
      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={nameOf}
          consequence={t('territories.deleteConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
      {expenseOf && <CityExpenseDialog town={expenseOf} onClose={() => setExpenseOf(null)} />}
      {editing && territories.data && (
        <TerritoryDialog
          key={editing.territory?.id ?? `${editing.level}-${editing.parentId ?? ''}`}
          territory={editing.territory}
          level={editing.level}
          parentId={editing.parentId}
          territories={territories.data}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
