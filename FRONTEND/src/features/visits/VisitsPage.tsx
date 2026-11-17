import { keepPreviousData } from '@tanstack/react-query'
import {
  CameraIcon,
  CheckIcon,
  ClipboardListIcon,
  Loader2Icon,
  MapPinCheckIcon,
  MapPinXIcon,
  PillIcon,
  QrCodeIcon,
  StethoscopeIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVisitsList } from '@/api/generated/endpoints'
import type { VisitListItemDto, VisitsListParams, VisitStatus } from '@/api/generated/model'
import { DataTable } from '@/components/data-table/DataTable'
import { dataTableColumns } from '@/components/data-table/features'
import { FilterField, SearchInput, ToolbarSpacer } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  formatNumber,
  fromDateInputValue,
  localizedName,
  toDateInputValue,
} from '@/lib/format'

const column = dataTableColumns<VisitListItemDto>()
/** Same limits as VisitService in the API. */
const MAX_RANGE_DAYS = 31
const MAX_ROWS = 1000
const DAY_MS = 86_400_000
const NO_VISITS: VisitListItemDto[] = []

const STATUS_BADGE: Record<VisitStatus, 'warning' | 'success' | 'outline'> = {
  inProgress: 'warning',
  completed: 'success',
  cancelled: 'outline',
}

function lastWeek(): { from: string; to: string } {
  const today = new Date()
  return { from: toDateInputValue(new Date(today.getTime() - 6 * DAY_MS)), to: toDateInputValue(today) }
}

export function VisitsPage() {
  const { t } = useTranslation()
  const [range, setRange] = useState(lastWeek)
  const [status, setStatus] = useState<'' | VisitStatus>('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [search, setSearch] = useState('')

  // Whole local days: from 00:00 of the first day to 00:00 after the last day.
  const start = fromDateInputValue(range.from)
  const end = new Date(fromDateInputValue(range.to).getTime() + DAY_MS)
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS)
  const rangeValid = range.from !== '' && range.to !== '' && days >= 1 && days <= MAX_RANGE_DAYS

  const params: VisitsListParams = {
    from: start.toISOString(),
    to: end.toISOString(),
    ...(status ? { status } : {}),
    ...(reviewOnly ? { needsReview: true } : {}),
  }
  const visits = useVisitsList(params, { query: { enabled: rangeValid, placeholderData: keepPreviousData } })

  const filtered = useMemo(() => {
    if (!visits.data) return undefined
    const q = search.trim().toLowerCase()
    if (!q) return visits.data
    return visits.data.filter(
      (v) =>
        v.userName.toLowerCase().includes(q) ||
        v.customerName.toLowerCase().includes(q) ||
        (v.customerNameAr ?? '').includes(q),
    )
  }, [visits.data, search])

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('checkInAt', {
          header: () => t('visits.checkIn'),
          sortDescFirst: true,
          cell: (info) => <span className="tabular-nums">{formatDateTime(info.getValue())}</span>,
        }),
        column.accessor('userName', {
          header: () => t('visits.rep'),
          cell: (info) => <span className="font-medium">{info.getValue()}</span>,
        }),
        column.accessor((v) => localizedName(v.customerName, v.customerNameAr), {
          id: 'customer',
          header: () => t('visits.customer'),
          cell: ({ row, getValue }) => (
            <span className="inline-flex items-center gap-1.5">
              {row.original.customerType === 'doctor' ? (
                <StethoscopeIcon
                  className="size-3.5 text-muted-foreground"
                  aria-label={t('customers.types.doctor')}
                />
              ) : (
                <PillIcon
                  className="size-3.5 text-muted-foreground"
                  aria-label={t('customers.types.pharmacy')}
                />
              )}
              {getValue()}
            </span>
          ),
        }),
        column.accessor('status', {
          header: () => t('visits.status'),
          cell: (info) => (
            <Badge variant={STATUS_BADGE[info.getValue()]}>{t(`visits.statuses.${info.getValue()}`)}</Badge>
          ),
        }),
        column.accessor(
          (v) => (v.checkOutAt ? new Date(v.checkOutAt).getTime() - new Date(v.checkInAt).getTime() : -1),
          {
            id: 'duration',
            header: () => t('visits.duration'),
            cell: ({ row }) =>
              row.original.checkOutAt ? (
                <span className="tabular-nums">
                  {formatDuration(row.original.checkInAt, row.original.checkOutAt)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
            meta: { className: 'hidden md:table-cell' },
          },
        ),
        column.accessor('checkInDistanceMeters', {
          header: () => t('visits.distance'),
          cell: ({ row }) => (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              {row.original.checkInWithinGeofence ? (
                <MapPinCheckIcon className="size-4 text-success" aria-label={t('visits.inside')} />
              ) : (
                <MapPinXIcon className="size-4 text-destructive" aria-label={t('visits.outside')} />
              )}
              {formatDistance(row.original.checkInDistanceMeters)}
            </span>
          ),
          meta: { className: 'hidden lg:table-cell' },
        }),
        column.display({
          id: 'proof',
          header: () => t('visits.proof'),
          cell: ({ row }) => (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              {row.original.qrVerified && (
                <span
                  className="inline-flex items-center gap-0.5 text-success"
                  title={t('visits.qrVerified')}
                >
                  <QrCodeIcon className="size-4" />
                  <CheckIcon className="size-3" />
                </span>
              )}
              {row.original.photoCount > 0 && (
                <span className="inline-flex items-center gap-1" title={t('visits.photos')}>
                  <CameraIcon className="size-4" />
                  {formatNumber(row.original.photoCount)}
                </span>
              )}
              {!row.original.qrVerified && row.original.photoCount === 0 && '—'}
            </span>
          ),
          meta: { className: 'hidden lg:table-cell' },
        }),
        column.accessor('needsReview', {
          header: () => t('visits.review'),
          cell: (info) =>
            info.getValue() ? (
              <Badge variant="destructive">{t('visits.needsReview')}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        }),
      ]),
    [t],
  )

  return (
    <>
      <PageHeader title={t('visits.title')} description={t('visits.hint')} />
      <DataTable
        columns={columns}
        data={rangeValid ? filtered : NO_VISITS}
        isLoading={visits.isLoading}
        error={visits.error}
        onRetry={() => void visits.refetch()}
        getRowId={(v) => v.id}
        initialSorting={[{ id: 'checkInAt', desc: true }]}
        filtered={search !== '' || status !== '' || reviewOnly}
        onClearFilters={() => {
          setSearch('')
          setStatus('')
          setReviewOnly(false)
        }}
        empty={
          rangeValid
            ? { icon: ClipboardListIcon, title: t('visits.empty'), description: t('visits.emptyHint') }
            : { icon: ClipboardListIcon, title: t('visits.invalidRange', { days: MAX_RANGE_DAYS }) }
        }
        footer={
          visits.data?.length === MAX_ROWS
            ? t('visits.capped', { formatted: formatNumber(MAX_ROWS) })
            : undefined
        }
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('visits.searchPlaceholder')} />
            <FilterField label={t('visits.from')}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  className="h-9 w-40"
                  value={range.from}
                  max={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
              )}
            </FilterField>
            <FilterField label={t('visits.to')}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  className="h-9 w-40"
                  value={range.to}
                  min={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              )}
            </FilterField>
            <FilterField label={t('visits.status')}>
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as '' | VisitStatus)}
                >
                  <option value="">{t('table.all')}</option>
                  <option value="inProgress">{t('visits.statuses.inProgress')}</option>
                  <option value="completed">{t('visits.statuses.completed')}</option>
                  <option value="cancelled">{t('visits.statuses.cancelled')}</option>
                </NativeSelect>
              )}
            </FilterField>
            <div className="flex h-9 items-center gap-2">
              <Checkbox
                id="visits-review-only"
                checked={reviewOnly}
                onCheckedChange={(checked) => setReviewOnly(checked === true)}
              />
              <Label htmlFor="visits-review-only" className="font-normal">
                {t('visits.reviewOnly')}
              </Label>
            </div>
            <ToolbarSpacer />
            {visits.isFetching && !visits.isLoading && (
              <Loader2Icon
                className="size-4 animate-spin text-muted-foreground"
                aria-label={t('common.loading')}
              />
            )}
          </>
        }
      />
    </>
  )
}
