import { CornerDownLeftIcon, MapPinnedIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTerritoriesList } from '@/api/generated/endpoints'
import type { TerritoryLevel } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { formatNumber, localizedName } from '@/lib/format'
import { flattenTerritories, type TerritoryNode } from './territory-tree'

const column = dataTableColumns<TerritoryNode>()
const LEVELS: TerritoryLevel[] = ['region', 'area', 'territory']
const LEVEL_BADGE: Record<TerritoryLevel, 'default' | 'secondary' | 'outline'> = {
  region: 'default',
  area: 'secondary',
  territory: 'outline',
}

export function TerritoriesPage() {
  const { t } = useTranslation()
  const territories = useTerritoriesList()
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState<'' | TerritoryLevel>('')

  const nodes = useMemo(
    () => (territories.data ? flattenTerritories(territories.data) : undefined),
    [territories.data],
  )
  const byId = useMemo(() => new Map((nodes ?? []).map((n) => [n.id, n])), [nodes])

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
        }),
        column.accessor('level', {
          header: () => t('territories.level'),
          cell: (info) => (
            <Badge variant={LEVEL_BADGE[info.getValue()]}>{t(`territories.levels.${info.getValue()}`)}</Badge>
          ),
        }),
        column.accessor(
          (n) => (n.parentId ? localizedName(byId.get(n.parentId)?.name, byId.get(n.parentId)?.nameAr) : ''),
          {
            id: 'parent',
            header: () => t('territories.parent'),
            cell: (info) => info.getValue() || <span className="text-muted-foreground">—</span>,
            meta: { className: 'hidden md:table-cell' },
          },
        ),
        column.accessor('userCount', {
          header: () => t('territories.users'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
        }),
        column.accessor('customerCount', {
          header: () => t('territories.customers'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
        }),
      ]),
    [t, byId],
  )

  return (
    <>
      <PageHeader title={t('territories.title')} description={t('territories.hint')} />
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
        empty={{ icon: MapPinnedIcon, title: t('territories.empty') }}
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('territories.searchPlaceholder')}
            />
            <FilterField label={t('territories.level')}>
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
          </>
        }
      />
    </>
  )
}
