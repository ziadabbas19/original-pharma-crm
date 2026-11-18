import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { BellIcon, CheckCheckIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  notificationsBulkDelete,
  useNotificationsList,
  useNotificationsMarkAllRead,
} from '@/api/generated/endpoints'
import type { NotificationDto } from '@/api/generated/model'
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog'
import { SelectionBar } from '@/components/bulk/SelectionBar'
import { useBulkRunner, useDeleteTarget } from '@/components/bulk/use-bulk-delete'
import { useSelection } from '@/components/bulk/use-selection'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { formatDateTime, formatNumber } from '@/lib/format'
import { invalidateApi } from '@/lib/invalidate-api'
import { cn } from '@/lib/utils'
import { notificationIsAboutOrder, notificationText } from './notification-text'
import { useMarkNotificationRead } from './use-notifications'

const notificationId = (n: NotificationDto) => n.id

/** The signed-in user's notifications; the same screen in the dashboard and the rep app. */
export function NotificationsPage({ app }: { app: 'admin' | 'rep' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const list = useNotificationsList({ unreadOnly, limit: 200 })
  const markRead = useMarkNotificationRead()
  const markAll = useNotificationsMarkAllRead()
  const rows = useMemo(() => list.data ?? [], [list.data])
  const selection = useSelection(rows, notificationId)
  const target = useDeleteTarget()
  const bulk = useBulkRunner(notificationsBulkDelete, ['/api/notifications'], selection)
  const nameOf = (id: string) => {
    const n = rows.find((x) => x.id === id)
    return n ? notificationText(n, t).title : id
  }

  const open = async (n: NotificationDto) => {
    setError(null)
    try {
      if (!n.readAt) await markRead([n.id])
    } catch (e) {
      setError(e)
    }
    if (!n.entityId) return
    if (notificationIsAboutOrder(n)) {
      if (app === 'rep') await navigate({ to: '/rep/orders/$orderId', params: { orderId: n.entityId } })
      else await navigate({ to: '/admin/orders', search: { order: n.entityId } })
    } else if (app === 'rep') {
      await navigate({ to: '/rep/visits/$visitId', params: { visitId: n.entityId } })
    } else {
      await navigate({ to: '/admin/visits', search: { visit: n.entityId } })
    }
  }

  const readSelected = async () => {
    setError(null)
    try {
      await markRead(selection.ids)
      selection.clear()
    } catch (e) {
      setError(e)
    }
  }

  const readAll = async () => {
    setError(null)
    try {
      await markAll.mutateAsync()
      await invalidateApi(queryClient, '/api/notifications')
    } catch (e) {
      setError(e)
    }
  }

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        description={t('notifications.hint')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((v) => !v)}
            >
              {unreadOnly ? t('notifications.showAll') : t('notifications.showUnread')}
            </Button>
            <Button variant="outline" size="sm" disabled={markAll.isPending} onClick={() => void readAll()}>
              <CheckCheckIcon />
              {t('notifications.markAllRead')}
            </Button>
          </div>
        }
      />
      <FormError error={error} />
      <Card className="gap-0 overflow-hidden py-0">
        {list.isLoading ? (
          <LoadingState className="p-3" />
        ) : list.error ? (
          <div className="p-3">
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={BellIcon}
            title={t('notifications.empty')}
            description={t('notifications.emptyHint')}
          />
        ) : (
          <>
            <label className="flex items-center gap-2 border-b px-3 py-2 text-sm">
              <Checkbox
                checked={selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false}
                onCheckedChange={(v) => selection.setAll(v === true)}
              />
              {t('bulk.selectAll', { count: selection.total, value: formatNumber(selection.total) })}
            </label>
            <SelectionBar selection={selection}>
              <Button size="sm" variant="outline" onClick={() => void readSelected()}>
                <CheckCheckIcon />
                {t('notifications.markRead')}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => target.open(selection.ids)}>
                <Trash2Icon />
                {t('bulk.deleteSelected')}
              </Button>
            </SelectionBar>
            <ul className="divide-y">
              {rows.map((n) => {
                const { title, body } = notificationText(n, t)
                return (
                  <li key={n.id} className={cn('flex items-start gap-3 p-3', !n.readAt && 'bg-primary/5')}>
                    <Checkbox
                      className="mt-0.5"
                      aria-label={t('bulk.selectRow', { name: title })}
                      checked={selection.has(n.id)}
                      onCheckedChange={(v) => selection.toggle(n.id, v === true)}
                    />
                    <button type="button" className="min-w-0 flex-1 text-start" onClick={() => void open(n)}>
                      <span className={cn('block text-sm', !n.readAt && 'font-semibold')}>{title}</span>
                      {body && (
                        <span className="block text-sm whitespace-pre-line text-muted-foreground">
                          {body}
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </button>
                    {!n.readAt && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Card>
      {target.ids && (
        <BulkDeleteDialog
          ids={target.ids}
          nameOf={nameOf}
          preview={false}
          consequence={t('notifications.deleteConsequence')}
          run={bulk.run}
          onDone={bulk.onDone}
          onClose={target.close}
        />
      )}
    </>
  )
}
