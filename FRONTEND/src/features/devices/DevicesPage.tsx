import { keepPreviousData } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  BatteryWarningIcon,
  BellOffIcon,
  CheckCircle2Icon,
  FlagIcon,
  Loader2Icon,
  MapIcon,
  MapPinIcon,
  SmartphoneIcon,
  Trash2Icon,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { trackingMonitorDeleteDevices, useTrackingMonitorGetDevices } from '@/api/generated/endpoints'
import type { DeviceDto, DevicePlatform, TrackingMonitorGetDevicesParams } from '@/api/generated/model'
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
import { usePermission } from '@/features/auth/usePermission'
import { useNow } from '@/hooks/use-now'
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { P } from '@/lib/permissions'

const column = dataTableColumns<DeviceDto>()
type HealthFilter = 'all' | 'unhealthy' | 'healthy'
const PLATFORMS: DevicePlatform[] = ['android', 'ios', 'web']
const deviceId = (d: DeviceDto) => d.id

/**
 * Health of every rep phone as last reported by the app (permissions, battery
 * limits, GPS, mock location). Problems are reviewed through the rep's tracking
 * flags; the actions link there and to the live map.
 */
export function DevicesPage() {
  const { t } = useTranslation()
  const canReviewFlags = usePermission(P.tracking.reviewFlags)
  const canViewLive = usePermission(P.tracking.viewLive)
  const navigate = useNavigate()
  const canDelete = usePermission(P.devices.delete)
  const now = useNow(60_000)
  const target = useDeleteTarget()
  const [health, setHealth] = useState<HealthFilter>('all')
  const [platform, setPlatform] = useState<'' | DevicePlatform>('')
  const [search, setSearch] = useState('')

  const params: TrackingMonitorGetDevicesParams | undefined =
    health === 'all' ? undefined : { healthy: health === 'healthy' }
  const devices = useTrackingMonitorGetDevices(params, {
    query: { placeholderData: keepPreviousData, refetchInterval: 120_000 },
  })

  const filtered = useMemo(() => {
    if (!devices.data) return undefined
    const q = search.trim().toLowerCase()
    return devices.data.filter(
      (d) =>
        (!platform || d.platform === platform) &&
        (!q ||
          d.userName.toLowerCase().includes(q) ||
          `${d.manufacturer ?? ''} ${d.model ?? ''}`.toLowerCase().includes(q) ||
          d.deviceId.toLowerCase().includes(q)),
    )
  }, [devices.data, platform, search])

  const unhealthyCount = devices.data?.filter((d) => !d.isHealthy).length ?? 0

  const selection = useSelection(filtered, deviceId)
  const bulk = useBulkRunner(trackingMonitorDeleteDevices, ['/api/tracking/monitor/devices'], selection)

  const flagsLabel = useCallback(
    (open: number) => (open > 0 ? t('devices.reviewFlags', { count: open }) : t('devices.flags')),
    [t],
  )

  const columns = useMemo(
    () =>
      column.columns([
        column.accessor('userName', {
          header: () => t('devices.rep'),
          cell: (info) => <span className="font-medium">{info.getValue() || '—'}</span>,
        }),
        column.accessor((d) => [d.manufacturer, d.model].filter(Boolean).join(' '), {
          id: 'device',
          header: () => t('devices.device'),
          cell: ({ row, getValue }) => (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <SmartphoneIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span>{getValue() || t('devices.unknownModel')}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                <Badge variant="outline" className="font-normal">
                  {t(`devices.platforms.${row.original.platform}`)}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {t(`devices.sources.${row.original.source}`)}
                </Badge>
              </div>
            </div>
          ),
          meta: { className: 'hidden @[50rem]:table-cell' },
        }),
        column.accessor('isHealthy', {
          header: () => t('devices.health'),
          cell: ({ row }) =>
            row.original.isHealthy ? (
              <Badge variant="success">
                <CheckCircle2Icon />
                {t('devices.healthy')}
              </Badge>
            ) : (
              <div className="flex max-w-xs flex-col items-start gap-1">
                <Badge variant="destructive">
                  {t('devices.issuesCount', { count: row.original.issues.length })}
                </Badge>
                <ul className="text-xs whitespace-normal text-muted-foreground">
                  {row.original.issues.map((issue) => (
                    <li key={issue}>• {t(`health.issues.${issue}`, { defaultValue: issue })}</li>
                  ))}
                </ul>
              </div>
            ),
        }),
        column.display({
          id: 'checks',
          header: () => t('devices.checks'),
          cell: ({ row }) => <DeviceChecks device={row.original} />,
          meta: { className: 'hidden @[65rem]:table-cell' },
        }),
        column.accessor((d) => d.appVersion ?? '', {
          id: 'appVersion',
          header: () => t('devices.app'),
          cell: ({ row }) => (
            <div className="text-xs">
              <div dir="ltr" className="text-start">
                {row.original.appVersion ?? '—'}
              </div>
              <div className="text-muted-foreground">{row.original.osVersion ?? ''}</div>
            </div>
          ),
          meta: { className: 'hidden @[74rem]:table-cell' },
        }),
        column.accessor('onboardingCompletedAt', {
          header: () => t('devices.setup'),
          cell: (info) =>
            info.getValue() ? (
              <span className="text-xs" title={formatDateTime(info.getValue())}>
                {formatDate(info.getValue())}
              </span>
            ) : (
              <Badge variant="warning">{t('devices.setupMissing')}</Badge>
            ),
          meta: { className: 'hidden @[57rem]:table-cell' },
        }),
        column.accessor('lastReportedAt', {
          header: () => t('devices.lastReport'),
          sortDescFirst: true,
          cell: (info) => (
            <span title={formatDateTime(info.getValue())} className="tabular-nums">
              {formatRelative(info.getValue(), now)}
            </span>
          ),
          meta: { className: 'hidden @[40rem]:table-cell' },
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
              {canReviewFlags && (
                <Button asChild size="sm" variant={row.original.openFlags > 0 ? 'default' : 'outline'}>
                  <Link
                    to="/admin/flags"
                    search={{ userId: row.original.userId, status: 'open' }}
                    aria-label={flagsLabel(row.original.openFlags)}
                    title={flagsLabel(row.original.openFlags)}
                  >
                    <FlagIcon />
                    <span className="hidden @[40rem]:inline">{flagsLabel(row.original.openFlags)}</span>
                    {row.original.openFlags > 0 && (
                      <span className="tabular-nums @[40rem]:hidden">
                        {formatNumber(row.original.openFlags)}
                      </span>
                    )}
                  </Link>
                </Button>
              )}
              {canDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive"
                  aria-label={t('common.delete')}
                  title={t('common.delete')}
                  onClick={() => target.open([row.original.id])}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ),
        }),
      ]),
    [t, now, canViewLive, canReviewFlags, canDelete, target, flagsLabel],
  )

  return (
    <>
      <PageHeader
        title={t('devices.title')}
        description={t('devices.hint')}
        actions={
          devices.data &&
          unhealthyCount > 0 && (
            <Badge variant="destructive">{t('devices.unhealthySummary', { count: unhealthyCount })}</Badge>
          )
        }
      />
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={devices.isLoading}
        error={devices.error}
        onRetry={() => void devices.refetch()}
        getRowId={deviceId}
        onRowClick={
          canViewLive || canReviewFlags
            ? (d) => {
                // The first action of the row: the rep on the live map, otherwise their tracking flags.
                if (canViewLive) void navigate({ to: '/admin/live-map', search: { rep: d.userId } })
                else void navigate({ to: '/admin/flags', search: { userId: d.userId, status: 'open' } })
              }
            : undefined
        }
        selection={canDelete ? selection : undefined}
        rowLabel={nameOfDevice}
        bulkActions={
          <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
            <Trash2Icon />
            {t('bulk.deleteSelected')}
          </Button>
        }
        rowClassName={(d) => (d.isHealthy ? undefined : 'bg-destructive/5')}
        filtered={search !== '' || platform !== '' || health !== 'all'}
        onClearFilters={() => {
          setSearch('')
          setPlatform('')
          setHealth('all')
        }}
        empty={{ icon: SmartphoneIcon, title: t('devices.empty'), description: t('devices.emptyHint') }}
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t('devices.searchPlaceholder')} />
            <FilterField
              label={t('devices.health')}
              active={health !== 'all'}
              display={health === 'unhealthy' ? t('devices.needsAttention') : t('devices.healthy')}
              onReset={() => setHealth('all')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-40"
                  value={health}
                  onChange={(e) => setHealth(e.target.value as HealthFilter)}
                >
                  <option value="all">{t('table.all')}</option>
                  <option value="unhealthy">{t('devices.needsAttention')}</option>
                  <option value="healthy">{t('devices.healthy')}</option>
                </NativeSelect>
              )}
            </FilterField>
            <FilterField
              label={t('devices.platform')}
              active={platform !== ''}
              display={platform ? t(`devices.platforms.${platform}`) : undefined}
              onReset={() => setPlatform('')}
            >
              {(id) => (
                <NativeSelect
                  id={id}
                  className="w-32"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as '' | DevicePlatform)}
                >
                  <option value="">{t('table.all')}</option>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {t(`devices.platforms.${p}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FilterField>
            <ToolbarSpacer />
            {devices.isFetching && !devices.isLoading && (
              <Loader2Icon
                className="size-4 animate-spin text-muted-foreground"
                aria-label={t('common.loading')}
              />
            )}
          </>
        }
      />
      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={(id) => {
            const device = devices.data?.find((d) => d.id === id)
            return device ? nameOfDevice(device) : id
          }}
          consequence={t('devices.deleteConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
    </>
  )
}

function nameOfDevice(d: DeviceDto): string {
  return [d.userName, d.manufacturer, d.model].filter(Boolean).join(' · ')
}

/** Compact view of the settings that matter for background tracking. */
function DeviceChecks({ device }: { device: DeviceDto }) {
  const { t } = useTranslation()
  const location = device.locationPermission
  return (
    <div className="flex flex-wrap gap-1">
      <Badge
        variant={location === 'always' ? 'secondary' : location === 'none' ? 'destructive' : 'warning'}
        className="font-normal"
        title={t('devices.locationPermission')}
      >
        <MapPinIcon />
        {t(`devices.location.${location}`)}
        {!device.preciseLocation && location !== 'none' && ` · ${t('devices.approximate')}`}
      </Badge>
      {(device.notificationPermission === 'denied' || device.notificationPermission === 'prompt') && (
        <Badge variant="warning" className="font-normal">
          <BellOffIcon />
          {t('devices.notificationsOff')}
        </Badge>
      )}
      {device.batteryOptimizationIgnored === false && (
        <Badge variant="warning" className="font-normal">
          <BatteryWarningIcon />
          {t('devices.batteryLimited')}
        </Badge>
      )}
      {device.powerSaveMode === true && (
        <Badge variant="outline" className="font-normal">
          {t('devices.powerSave')}
        </Badge>
      )}
      {device.mockLocationDetected && (
        <Badge variant="destructive" className="font-normal">
          {t('liveMap.mock')}
        </Badge>
      )}
    </div>
  )
}
