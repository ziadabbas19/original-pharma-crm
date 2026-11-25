import { keepPreviousData } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { FlagIcon, Loader2Icon, MapIcon, SearchCheckIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrackingMonitorGetFlags } from '@/api/generated/endpoints'
import type { TrackingFlagDto, TrackingFlagType } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import { useNow } from '@/hooks/use-now'
import { formatDateTime, formatRelative } from '@/lib/format'
import { P } from '@/lib/permissions'
import { FlagStatusBadge, FlagTypeBadge, ScoreBadge, SignalList } from './flag-display'
import { FLAG_TYPES, type FlagStatusFilter, type FlagsSearch } from './flags-search'
import { ReviewFlagDialog } from './ReviewFlagDialog'

const route = getRouteApi('/admin/flags')
const column = dataTableColumns<TrackingFlagDto>()
/** The API returns the newest 200 flags per request. */
const MAX_ROWS = 200

export function FlagsPage() {
  const { t } = useTranslation()
  const navigate = route.useNavigate()
  const search = route.useSearch()
  const canViewLive = usePermission(P.tracking.viewLive)
  const now = useNow(60_000)
  const [text, setText] = useState('')
  const [reviewing, setReviewing] = useState<TrackingFlagDto | null>(null)

  const status: FlagStatusFilter = search.status ?? 'open'
  const flags = useTrackingMonitorGetFlags(status === 'all' ? undefined : { status }, {
    query: { placeholderData: keepPreviousData, refetchInterval: 60_000 },
  })

  const setSearch = (patch: Partial<FlagsSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })

  const reps = useMemo(() => {
    const names = new Map<string, string>()
    for (const flag of flags.data ?? []) names.set(flag.userId, flag.userName ?? flag.userId)
    return [...names].toSorted((a, b) => a[1].localeCompare(b[1]))
  }, [flags.data])

  const filtered = useMemo(() => {
    if (!flags.data) return undefined
    const q = text.trim().toLowerCase()
    return flags.data.filter(
      (f) =>
        (!search.type || f.type === search.type) &&
        (!search.userId || f.userId === search.userId) &&
        (!q || (f.userName ?? '').toLowerCase().includes(q) || (f.details ?? '').toLowerCase().includes(q)),
    )
  }, [flags.data, search.type, search.userId, text])

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('createdAt', {
          header: () => t('flags.raised'),
          sortDescFirst: true,
          cell: (info) => (
            <span title={formatDateTime(info.getValue())} className="tabular-nums">
              {formatRelative(info.getValue(), now)}
            </span>
          ),
        }),
        column.accessor((f) => f.userName ?? '', {
          id: 'rep',
          header: () => t('flags.rep'),
          cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
        }),
        column.accessor('type', {
          header: () => t('flags.type'),
          cell: (info) => <FlagTypeBadge type={info.getValue()} />,
          meta: { className: 'hidden @[44rem]:table-cell' },
        }),
        column.accessor('score', {
          header: () => t('flags.score'),
          sortDescFirst: true,
          cell: (info) => <ScoreBadge score={info.getValue()} />,
          meta: { className: 'hidden @[36rem]:table-cell' },
        }),
        column.accessor('signals', {
          header: () => t('flags.signalsLabel'),
          enableSorting: false,
          cell: (info) => <SignalList signals={info.getValue()} />,
          meta: { className: 'hidden @[56rem]:table-cell' },
        }),
        column.accessor('details', {
          header: () => t('flags.details'),
          enableSorting: false,
          cell: (info) => (
            <span
              className="block max-w-xs truncate text-muted-foreground"
              title={info.getValue() ?? undefined}
            >
              {info.getValue() || '—'}
            </span>
          ),
          meta: { className: 'hidden @[72rem]:table-cell' },
        }),
        column.accessor('status', {
          header: () => t('flags.status'),
          cell: (info) => <FlagStatusBadge status={info.getValue()} />,
        }),
        column.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('table.actions')}</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              {canViewLive && (
                <Button asChild size="icon" variant="ghost" className="size-8" title={t('flags.showOnMap')}>
                  <Link
                    to="/admin/live-map"
                    search={{ rep: row.original.userId }}
                    aria-label={t('flags.showOnMap')}
                  >
                    <MapIcon />
                  </Link>
                </Button>
              )}
              <Button
                size="sm"
                variant={row.original.status === 'open' ? 'default' : 'outline'}
                onClick={() => setReviewing(row.original)}
              >
                <SearchCheckIcon />
                {row.original.status === 'open' ? t('flags.review.action') : t('flags.review.view')}
              </Button>
            </div>
          ),
        }),
      ]),
    [t, now, canViewLive],
  )

  const repName = search.userId
    ? (reps.find(([id]) => id === search.userId)?.[1] ?? t('flags.selectedRep'))
    : null
  const isFiltered = text !== '' || !!search.type || !!search.userId

  return (
    <>
      <PageHeader title={t('flags.title')} description={t('flags.hint')} />
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={flags.isLoading}
        error={flags.error}
        onRetry={() => void flags.refetch()}
        getRowId={(f) => f.id}
        onRowClick={setReviewing}
        initialSorting={[{ id: 'createdAt', desc: true }]}
        rowClassName={(f) => (f.status === 'open' && f.score >= 70 ? 'bg-destructive/5' : undefined)}
        filtered={isFiltered}
        onClearFilters={() => {
          setText('')
          setSearch({ type: undefined, userId: undefined })
        }}
        empty={{
          icon: FlagIcon,
          title: status === 'open' ? t('flags.emptyOpen') : t('flags.empty'),
          description: status === 'open' ? t('flags.emptyOpenHint') : undefined,
        }}
        footer={flags.data?.length === MAX_ROWS ? t('flags.capped', { count: MAX_ROWS }) : undefined}
        toolbar={
          <>
            <SearchInput value={text} onChange={setText} placeholder={t('flags.searchPlaceholder')} />
            <FilterField
              label={t('flags.status')}
              active={status !== 'open'}
              display={status === 'all' ? t('table.all') : t(`flags.statuses.${status}`)}
              onReset={() => setSearch({ status: undefined })}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={status}
                  onChange={(e) => setSearch({ status: e.target.value as FlagStatusFilter })}
                >
                  <option value="open">{t('flags.statuses.open')}</option>
                  <option value="acknowledged">{t('flags.statuses.acknowledged')}</option>
                  <option value="confirmed">{t('flags.statuses.confirmed')}</option>
                  <option value="dismissed">{t('flags.statuses.dismissed')}</option>
                  <option value="all">{t('table.all')}</option>
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('flags.type')}
              active={!!search.type}
              display={search.type ? t(`flags.types.${search.type}`) : undefined}
              onReset={() => setSearch({ type: undefined })}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-48"
                  value={search.type ?? ''}
                  onChange={(e) =>
                    setSearch({ type: (e.target.value || undefined) as TrackingFlagType | undefined })
                  }
                >
                  <option value="">{t('table.all')}</option>
                  {FLAG_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`flags.types.${type}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('flags.rep')}
              active={!!search.userId}
              display={repName ?? undefined}
              onReset={() => setSearch({ userId: undefined })}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-44"
                  value={search.userId ?? ''}
                  onChange={(e) => setSearch({ userId: e.target.value || undefined })}
                >
                  <option value="">{t('table.all')}</option>
                  {search.userId && !reps.some(([rid]) => rid === search.userId) && (
                    <option value={search.userId}>{repName}</option>
                  )}
                  {reps.map(([rid, name]) => (
                    <option key={rid} value={rid}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            {repName && (
              <Badge variant="secondary" className="h-9 gap-1.5 px-2.5">
                {repName}
                <button
                  type="button"
                  onClick={() => setSearch({ userId: undefined })}
                  aria-label={t('states.clearFilters')}
                  className="rounded hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              </Badge>
            )}
            <ToolbarSpacer />
            {flags.isFetching && !flags.isLoading && (
              <Loader2Icon
                className="size-4 animate-spin text-muted-foreground"
                aria-label={t('common.loading')}
              />
            )}
          </>
        }
      />
      {reviewing && (
        <ReviewFlagDialog key={reviewing.id} flag={reviewing} onClose={() => setReviewing(null)} />
      )}
    </>
  )
}
