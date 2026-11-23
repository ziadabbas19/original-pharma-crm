import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import {
  CameraIcon,
  CheckIcon,
  ClipboardListIcon,
  Loader2Icon,
  MapPinCheckIcon,
  MapPinXIcon,
  PackageIcon,
  PillIcon,
  QrCodeIcon,
  StethoscopeIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useProductsList,
  useVisitsList,
  visitsBulkDelete,
  visitsBulkRestore,
} from '@/api/generated/endpoints'
import type {
  VisitFeedbackCategory,
  VisitListItemDto,
  VisitsListParams,
  VisitStatus,
} from '@/api/generated/model'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { usePermission } from '@/features/auth/usePermission'
import {
  formatDateTime,
  formatDay,
  formatDistance,
  formatDuration,
  formatNumber,
  fromDateInputValue,
  localizedName,
  toDateInputValue,
} from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { cn } from '@/lib/utils'
import { P } from '@/lib/permissions'
import { CATEGORY_BADGE, FEEDBACK_CATEGORIES, STATUS_BADGE } from './visit-labels'
import { distanceCells, locationBadges, mapLink } from './visit-location'
import { LocationBadges } from './VisitLocationBadges'
import { RepDayVisits } from './RepDayVisits'
import { VisitDetailSheet } from './VisitDetailSheet'
import { AmBadge } from './AmBadge'

const route = getRouteApi('/admin/visits')
const column = dataTableColumns<VisitListItemDto>()
const visitId = (v: VisitListItemDto) => v.id
/** Same limits as VisitService in the API. */
const MAX_RANGE_DAYS = 31
const MAX_ROWS = 1000
const DAY_MS = 86_400_000
const NO_VISITS: VisitListItemDto[] = []

function lastWeek(): { from: string; to: string } {
  const today = new Date()
  return { from: toDateInputValue(new Date(today.getTime() - 6 * DAY_MS)), to: toDateInputValue(today) }
}

/**
 * Visits for managers: a date range with filters, or one day at a time for one rep (with that rep's
 * expenses of the day).
 */
export function VisitsPage() {
  const { t } = useTranslation()
  const view = route.useSearch().view === 'day' ? 'day' : 'range'
  const navigate = route.useNavigate()
  return (
    <>
      <PageHeader
        title={t('visits.title')}
        description={t('visits.hint')}
        actions={
          <div className="inline-flex rounded-control border bg-card p-0.5" role="tablist">
            {(['range', 'day'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view === tab}
                onClick={() =>
                  void navigate({
                    search: (s) => ({ ...s, view: tab === 'day' ? 'day' : undefined }),
                    replace: true,
                  })
                }
                className={cn(
                  'min-h-11 rounded-[10px] px-4 text-sm font-medium',
                  view === tab
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                data-testid={`visits-view-${tab}`}
              >
                {t(`visits.views.${tab}`)}
              </button>
            ))}
          </div>
        }
      />
      {view === 'day' ? <RepDayVisits /> : <VisitsRangeView />}
    </>
  )
}

function VisitsRangeView() {
  const { t } = useTranslation()
  const [range, setRange] = useState(lastWeek)
  const [status, setStatus] = useState<'' | VisitStatus>('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [driftOnly, setDriftOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'' | NonNullable<VisitFeedbackCategory>>('')
  const [productId, setProductId] = useState('')
  const [archived, setArchived] = useState(false)
  const opened = route.useSearch().visit
  const [openId, setOpenId] = useState<string | null>(opened ?? null)
  const queryClient = useQueryClient()
  const canDelete = usePermission(P.visits.delete)
  const canRestore = usePermission(P.visits.restore)
  const canReadProducts = usePermission(P.products.read)
  const products = useProductsList(undefined, { query: { enabled: canReadProducts } })

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
    ...(driftOnly ? { locationDrift: true } : {}),
    ...(category ? { feedbackCategory: category } : {}),
    ...(productId ? { productId } : {}),
    ...(archived ? { archived: true } : {}),
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

  const selection = useSelection(rangeValid ? filtered : NO_VISITS, visitId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(visitsBulkDelete, ['/api/visits', '/api/stats'], selection)
  const nameOf = (id: string) => {
    const v = visits.data?.find((x) => x.id === id)
    return v ? `${v.userName} · ${localizedName(v.customerName, v.customerNameAr)}` : id
  }

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
          meta: { className: 'hidden @[39rem]:table-cell' },
        }),
        column.accessor((v) => localizedName(v.customerName, v.customerNameAr), {
          id: 'customer',
          header: () => t('visits.customer'),
          cell: ({ row, getValue }) => (
            <span className="inline-flex items-center gap-1.5">
              {row.original.customerType === 'hospital' ? (
                <AmBadge type="hospital" />
              ) : row.original.customerType === 'doctor' ? (
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
          cell: ({ row }) =>
            row.original.archivedAt ? (
              <ArchivedBadge />
            ) : (
              <Badge variant={STATUS_BADGE[row.original.status]}>
                {t(`visits.statuses.${row.original.status}`)}
              </Badge>
            ),
          meta: { className: 'hidden @[31rem]:table-cell' },
        }),
        column.accessor((v) => v.feedbackCategory ?? (v.hasFeedback ? 'text' : ''), {
          id: 'feedback',
          header: () => t('visits.feedback.title'),
          cell: ({ row }) =>
            row.original.feedbackCategory ? (
              <Badge variant={CATEGORY_BADGE[row.original.feedbackCategory]}>
                {t(`visits.feedback.categories.${row.original.feedbackCategory}`)}
              </Badge>
            ) : row.original.hasFeedback ? (
              <Badge variant="secondary">{t('visits.feedback.written')}</Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          meta: { className: 'hidden @[54rem]:table-cell' },
        }),
        column.accessor((v) => v.productCount ?? 0, {
          id: 'products',
          header: () => t('visits.products.title'),
          cell: (info) =>
            info.getValue() > 0 ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <PackageIcon className="size-3.5 text-muted-foreground" aria-hidden />
                {formatNumber(info.getValue())}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          meta: { className: 'hidden @[81rem]:table-cell' },
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
            meta: { className: 'hidden @[60rem]:table-cell' },
          },
        ),
        column.accessor((v) => v.location?.clinicDistanceMeters ?? v.checkInDistanceMeters, {
          id: 'location',
          header: () => t('visits.location.column'),
          cell: ({ row }) => {
            const v = row.original
            const cells = distanceCells(v.location)
            return (
              <div className="grid gap-0.5 text-xs" data-testid="visit-location-cell">
                <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                  {v.checkInWithinGeofence ? (
                    <MapPinCheckIcon className="size-4 text-success" aria-label={t('visits.inside')} />
                  ) : (
                    <MapPinXIcon className="size-4 text-destructive" aria-label={t('visits.outside')} />
                  )}
                  {v.location ? (
                    <a
                      href={mapLink(v.location.lat, v.location.lng)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="underline-offset-2 hover:underline"
                      title={t('visits.location.openMap')}
                    >
                      ±{formatDistance(Math.round(v.checkInAccuracy))}
                    </a>
                  ) : (
                    <span>±{formatDistance(Math.round(v.checkInAccuracy))}</span>
                  )}
                </span>
                <span className="flex flex-wrap gap-x-2 text-muted-foreground tabular-nums">
                  {cells.map((cell) => (
                    <span key={cell.key} className={cell.exceeded ? 'font-semibold text-warning' : undefined}>
                      {t(`visits.location.short.${cell.key}`)}{' '}
                      {cell.meters == null ? '—' : formatDistance(cell.meters)}
                    </span>
                  ))}
                </span>
              </div>
            )
          },
          meta: { className: 'hidden @[66rem]:table-cell' },
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
          meta: { className: 'hidden @[70.5rem]:table-cell' },
        }),
        column.accessor('needsReview', {
          header: () => t('visits.review'),
          cell: (info) => (
            <span
              title={info.row.original.reviewReasons.map((r) => t(`visits.reviewReasons.${r}`)).join(' · ')}
            >
              <LocationBadges badges={locationBadges(info.row.original.location, info.getValue())} />
            </span>
          ),
          meta: { className: 'hidden @[44.5rem]:table-cell' },
        }),
      ]),
    [t],
  )

  return (
    <>
      <DataTable
        columns={columns}
        data={rangeValid ? filtered : NO_VISITS}
        isLoading={visits.isLoading}
        error={visits.error}
        onRetry={() => void visits.refetch()}
        getRowId={(v) => v.id}
        initialSorting={[{ id: 'checkInAt', desc: true }]}
        filtered={
          search !== '' || status !== '' || reviewOnly || driftOnly || category !== '' || productId !== ''
        }
        onClearFilters={() => {
          setSearch('')
          setStatus('')
          setReviewOnly(false)
          setDriftOnly(false)
          setCategory('')
          setProductId('')
        }}
        onRowClick={(v) => setOpenId(v.id)}
        selection={(archived ? canRestore : canDelete) ? selection : undefined}
        rowLabel={(v) => `${v.userName} · ${v.customerName}`}
        bulkActions={
          archived ? (
            <RestoreSelectedButton
              selection={selection}
              nameOf={nameOf}
              run={(ids) => visitsBulkRestore({ ids })}
              onDone={() => void invalidateApi(queryClient, '/api/visits', '/api/stats')}
            />
          ) : (
            <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
              <Trash2Icon />
              {t('bulk.deleteSelected')}
            </Button>
          )
        }
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
            <FilterField
              label={t('visits.from')}
              active={range.from !== lastWeek().from}
              display={`${t('visits.from')} ${formatDay(range.from)}`}
              onReset={() => setRange((r) => ({ ...r, from: lastWeek().from }))}
            >
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
            <FilterField
              label={t('visits.to')}
              active={range.to !== lastWeek().to}
              display={`${t('visits.to')} ${formatDay(range.to)}`}
              onReset={() => setRange((r) => ({ ...r, to: lastWeek().to }))}
            >
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
            <FilterField
              label={t('visits.status')}
              active={status !== ''}
              display={status ? t(`visits.statuses.${status}`) : undefined}
              onReset={() => setStatus('')}
            >
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
            <FilterField
              label={t('visits.feedback.category')}
              active={category !== ''}
              display={category ? t(`visits.feedback.categories.${category}`) : undefined}
              onReset={() => setCategory('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-36"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as '' | NonNullable<VisitFeedbackCategory>)}
                >
                  <option value="">{t('table.all')}</option>
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`visits.feedback.categories.${c}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            {canReadProducts && (
              <FilterField
                label={t('visits.products.filter')}
                active={productId !== ''}
                display={(() => {
                  const p = (products.data ?? []).find((x) => x.id === productId)
                  return p ? localizedName(p.nameEn, p.nameAr) : undefined
                })()}
                onReset={() => setProductId('')}
              >
                {(id) => (
                  <NativeSelect
                    id={id}
                    className="w-44"
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                  >
                    <option value="">{t('table.all')}</option>
                    {(products.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {localizedName(p.nameEn, p.nameAr)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FilterField>
            )}
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
            <div className="flex h-9 items-center gap-2">
              <Checkbox
                id="visits-drift-only"
                checked={driftOnly}
                onCheckedChange={(checked) => setDriftOnly(checked === true)}
              />
              <Label htmlFor="visits-drift-only" className="font-normal">
                {t('visits.location.driftOnly')}
              </Label>
            </div>
            <ToolbarSpacer />
            {visits.isFetching && !visits.isLoading && (
              <Loader2Icon
                className="size-4 animate-spin text-muted-foreground"
                aria-label={t('common.loading')}
              />
            )}
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
          consequence={t('visits.deleteConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
      {openId && <VisitDetailSheet key={openId} visitId={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
