import { HistoryIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuditList } from '@/api/generated/endpoints'
import type { AuditAction, AuditEntryDto } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { formatDateTime, formatNumber } from '@/lib/format'

const column = dataTableColumns<AuditEntryDto>()
const ENTITIES = [
  'product',
  'product_line',
  'specialty',
  'collection_method',
  'territory',
  'customer',
  'user',
  'role',
  'order',
  'visit',
  'device',
]
const ACTIONS: AuditAction[] = [
  'created',
  'updated',
  'deleted',
  'archived',
  'restored',
  'moved',
  'bulkDelete',
  'bulkRestore',
]

/** Read-only trail of edits, deletes, archives and restores: who, what, when and how many. */
export function ActivityLogPage() {
  const { t } = useTranslation()
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState<'' | AuditAction>('')
  const [search, setSearch] = useState('')
  const log = useAuditList({ EntityType: entity || undefined, Action: action || undefined, Limit: 500 })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return log.data
    return log.data?.filter(
      (e) => e.actorName.toLowerCase().includes(q) || JSON.stringify(e.details).toLowerCase().includes(q),
    )
  }, [log.data, search])

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('createdAt', {
          header: () => t('activity.when'),
          sortDescFirst: true,
          cell: (info) => <span className="tabular-nums">{formatDateTime(info.getValue())}</span>,
        }),
        column.accessor('actorName', {
          header: () => t('activity.who'),
          cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        column.accessor('action', {
          header: () => t('activity.action'),
          cell: (info) => <Badge variant="secondary">{t(`activity.actions.${info.getValue()}`)}</Badge>,
        }),
        column.accessor('entityType', {
          header: () => t('activity.what'),
          cell: (info) => t(`activity.entities.${info.getValue()}`, { defaultValue: info.getValue() }),
          meta: { className: 'hidden @[32rem]:table-cell' },
        }),
        column.accessor('count', {
          header: () => t('activity.howMany'),
          cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
          meta: { className: 'hidden @[39rem]:table-cell' },
        }),
        column.accessor((e) => JSON.stringify(e.details), {
          id: 'details',
          header: () => t('activity.details'),
          enableSorting: false,
          cell: (info) => (
            <span
              dir="ltr"
              className="block max-w-xs truncate font-mono text-xs text-muted-foreground"
              title={info.getValue()}
            >
              {info.getValue()}
            </span>
          ),
          meta: { className: 'hidden @[59rem]:table-cell' },
        }),
      ]),
    [t],
  )

  return (
    <>
      <PageHeader title={t('activity.title')} description={t('activity.hint')} />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={log.isLoading}
        error={log.error}
        onRetry={() => void log.refetch()}
        getRowId={(e) => e.id}
        initialSorting={[{ id: 'createdAt', desc: true }]}
        filtered={entity !== '' || action !== '' || search !== ''}
        onClearFilters={() => {
          setEntity('')
          setAction('')
          setSearch('')
        }}
        empty={{ icon: HistoryIcon, title: t('activity.empty') }}
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} />
            <FilterField label={t('activity.what')}>
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-44"
                  value={entity}
                  onChange={(e) => setEntity(e.target.value)}
                >
                  <option value="">{t('table.all')}</option>
                  {ENTITIES.map((value) => (
                    <option key={value} value={value}>
                      {t(`activity.entities.${value}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField label={t('activity.action')}>
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-40"
                  value={action}
                  onChange={(e) => setAction(e.target.value as '' | AuditAction)}
                >
                  <option value="">{t('table.all')}</option>
                  {ACTIONS.map((value) => (
                    <option key={value} value={value}>
                      {t(`activity.actions.${value}`)}
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
