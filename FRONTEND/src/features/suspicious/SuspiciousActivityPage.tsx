import { keepPreviousData } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { Loader2Icon, SearchCheckIcon, ShieldCheckIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocationIntegrityListEvents } from '@/api/generated/endpoints'
import type { LocationIntegrityListEventsParams } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { ScoreBadge } from '@/features/flags/flag-display'
import { formatDay, formatTime } from '@/lib/format'
import { RepDaySheet } from './RepDaySheet'
import { defaultDays, groupByRepAndDay, rangeOf, REASON_CODES, type RepDayGroup } from './suspicious-logic'
import type { EventStatusFilter, SuspiciousSearch } from './suspicious-search'
import { useReasonLabel } from './reason-label'
import { ReasonBadges } from './trust-display'

const route = getRouteApi('/admin/suspicious-activity')
const column = dataTableColumns<RepDayGroup>()
/** The API returns at most this many events per request. */
const MAX_EVENTS = 500
const STATUSES: EventStatusFilter[] = ['all', 'open', 'acknowledged', 'confirmed', 'dismissed']

/**
 * Suspicious location activity per rep and day (tracking:review-suspicious, within scope). A row is
 * one rep on one day; opening it shows each event with its evidence and the acknowledge action.
 */
export function SuspiciousActivityPage() {
  const { t } = useTranslation()
  const reasonLabel = useReasonLabel()
  const navigate = route.useNavigate()
  const search = route.useSearch()
  const [defaults] = useState(() => defaultDays(new Date()))
  const from = search.from ?? defaults.from
  const to = search.to ?? defaults.to
  const status = search.status ?? 'all'

  const params: LocationIntegrityListEventsParams = {
    ...rangeOf(from, to),
    ...(search.userId ? { userId: search.userId } : {}),
    ...(search.reason ? { reason: search.reason } : {}),
    ...(status !== 'all' ? { status } : {}),
  }
  const events = useLocationIntegrityListEvents(params, {
    query: { placeholderData: keepPreviousData, refetchInterval: 60_000 },
  })

  const setSearch = (patch: Partial<SuspiciousSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
  const openGroup = useCallback(
    (group: RepDayGroup) =>
      void navigate({ search: (prev) => ({ ...prev, day: group.day, rep: group.userId }), replace: true }),
    [navigate],
  )

  const groups = useMemo(() => (events.data ? groupByRepAndDay(events.data) : undefined), [events.data])
  const reps = useMemo(() => {
    const names = new Map<string, string>()
    for (const e of events.data ?? []) names.set(e.userId, e.userName)
    return [...names].toSorted((a, b) => a[1].localeCompare(b[1]))
  }, [events.data])

  const opened =
    search.day && search.rep
      ? (groups?.find((g) => g.day === search.day && g.userId === search.rep) ?? null)
      : null

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('day', {
          header: () => t('suspicious.day'),
          sortDescFirst: true,
          cell: (info) => <span className="tabular-nums">{formatDay(info.getValue())}</span>,
        }),
        column.accessor('userName', {
          header: () => t('suspicious.rep'),
          cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
        }),
        column.accessor((g) => g.events.length, {
          id: 'events',
          header: () => t('suspicious.events'),
          cell: ({ row }) => (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="tabular-nums">{row.original.events.length}</span>
              {row.original.open > 0 && (
                <Badge variant="destructive" className="tabular-nums">
                  {t('suspicious.openCount', { count: row.original.open })}
                </Badge>
              )}
            </div>
          ),
        }),
        column.accessor('reasons', {
          header: () => t('suspicious.reasons'),
          enableSorting: false,
          cell: (info) => <ReasonBadges reasons={info.getValue()} max={3} />,
          meta: { className: 'hidden @[44rem]:table-cell' },
        }),
        column.accessor('maxScore', {
          header: () => t('flags.score'),
          sortDescFirst: true,
          cell: (info) => <ScoreBadge score={info.getValue()} />,
          meta: { className: 'hidden @[36rem]:table-cell' },
        }),
        column.accessor('lastAt', {
          header: () => t('suspicious.lastSeen'),
          cell: (info) => <span className="tabular-nums">{formatTime(info.getValue())}</span>,
          meta: { className: 'hidden @[56rem]:table-cell' },
        }),
        column.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('table.actions')}</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant={row.original.open > 0 ? 'default' : 'outline'}
                onClick={() => openGroup(row.original)}
                data-testid="open-rep-day"
              >
                <SearchCheckIcon />
                {t('suspicious.review')}
              </Button>
            </div>
          ),
        }),
      ]),
    [t, openGroup],
  )

  const isFiltered = !!search.userId || !!search.reason || status !== 'all' || !!search.from || !!search.to
  const repName = search.userId
    ? (reps.find(([id]) => id === search.userId)?.[1] ?? t('flags.selectedRep'))
    : null

  return (
    <>
      <PageHeader title={t('suspicious.title')} description={t('suspicious.hint')} />
      <DataTable
        columns={columns}
        data={groups}
        isLoading={events.isLoading}
        error={events.error}
        onRetry={() => void events.refetch()}
        getRowId={(g) => g.key}
        // The row (a card on phones) opens the rep's day, like its Review button.
        onRowClick={openGroup}
        initialSorting={[{ id: 'day', desc: true }]}
        rowClassName={(g) => (g.open > 0 && g.maxScore >= 70 ? 'bg-destructive/5' : undefined)}
        filtered={isFiltered}
        onClearFilters={() =>
          setSearch({
            userId: undefined,
            reason: undefined,
            status: undefined,
            from: undefined,
            to: undefined,
          })
        }
        empty={{
          icon: ShieldCheckIcon,
          title: t('suspicious.empty'),
          description: t('suspicious.emptyHint'),
        }}
        footer={
          events.data?.length === MAX_EVENTS ? t('suspicious.capped', { count: MAX_EVENTS }) : undefined
        }
        toolbar={
          <>
            <FilterField
              label={t('suspicious.from')}
              active={from !== defaults.from}
              display={`${t('suspicious.from')} ${formatDay(from)}`}
              onReset={() => setSearch({ from: undefined })}
            >
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  className="h-9 w-40"
                  value={from}
                  max={to}
                  onChange={(e) => e.target.value && setSearch({ from: e.target.value })}
                />
              )}
            </FilterField>
            <FilterField
              label={t('suspicious.to')}
              active={to !== defaults.to}
              display={`${t('suspicious.to')} ${formatDay(to)}`}
              onReset={() => setSearch({ to: undefined })}
            >
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  className="h-9 w-40"
                  value={to}
                  min={from}
                  onChange={(e) => e.target.value && setSearch({ to: e.target.value })}
                />
              )}
            </FilterField>
            <FilterField
              label={t('suspicious.rep')}
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
            <FilterField
              label={t('suspicious.reason')}
              active={!!search.reason}
              display={search.reason ? reasonLabel(search.reason) : undefined}
              onReset={() => setSearch({ reason: undefined })}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-52"
                  value={search.reason ?? ''}
                  onChange={(e) =>
                    setSearch({ reason: (e.target.value || undefined) as SuspiciousSearch['reason'] })
                  }
                >
                  <option value="">{t('table.all')}</option>
                  {REASON_CODES.map((code) => (
                    <option key={code} value={code}>
                      {reasonLabel(code)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('flags.status')}
              active={status !== 'all'}
              display={status === 'all' ? undefined : t(`flags.statuses.${status}`)}
              onReset={() => setSearch({ status: undefined })}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={status}
                  onChange={(e) => setSearch({ status: e.target.value as EventStatusFilter })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === 'all' ? t('table.all') : t(`flags.statuses.${s}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <ToolbarSpacer />
            {events.isFetching && !events.isLoading && (
              <Loader2Icon
                className="size-4 animate-spin text-muted-foreground"
                aria-label={t('common.loading')}
              />
            )}
          </>
        }
      />
      {opened && (
        <RepDaySheet
          key={opened.key}
          group={opened}
          onClose={() => setSearch({ day: undefined, rep: undefined })}
        />
      )}
    </>
  )
}
