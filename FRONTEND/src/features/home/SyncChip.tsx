import { CloudUploadIcon, Loader2Icon, WifiOffIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOnline } from '@/hooks/use-online'
import { formatNumber } from '@/lib/format'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { flushAllOutboxes, syncChipState, usePendingSyncCount } from './sync-status'

/**
 * Home: "Offline" while there is no network, "N waiting to send" while any outbox holds items, nothing
 * when everything is sent. Tapping it sends every outbox now and says how it went.
 */
export function SyncChip({ className }: { className?: string }) {
  const { t } = useTranslation()
  const online = useOnline()
  const waiting = usePendingSyncCount()
  const [busy, setBusy] = useState(false)
  const state = syncChipState(online, waiting)
  if (!state) return null

  const flush = async () => {
    setBusy(true)
    try {
      const left = await flushAllOutboxes()
      if (!navigator.onLine) toast.show({ tone: 'warning', message: t('sync.stillOffline') })
      else if (left === 0) toast.show({ tone: 'success', message: t('sync.allSent') })
      else
        toast.show({
          tone: 'warning',
          message: t('sync.someLeft', { count: left, value: formatNumber(left) }),
        })
    } finally {
      setBusy(false)
    }
  }

  const Icon = busy ? Loader2Icon : state.kind === 'offline' ? WifiOffIcon : CloudUploadIcon
  return (
    <button
      type="button"
      onClick={() => void flush()}
      disabled={busy}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium shadow-card transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
        state.kind === 'offline'
          ? 'border-warning/40 bg-warning-soft text-warning-soft-foreground'
          : 'border-primary/30 bg-primary-soft text-primary-soft-foreground',
      )}
      aria-label={t('sync.tapToSend')}
      title={t('sync.tapToSend')}
      data-testid="sync-chip"
      data-state={state.kind}
    >
      <Icon className={cn('size-4', busy && 'animate-spin')} aria-hidden />
      {state.kind === 'offline'
        ? state.waiting > 0
          ? t('sync.offlineWaiting', { count: state.waiting, value: formatNumber(state.waiting) })
          : t('sync.offline')
        : t('sync.waiting', { count: state.waiting, value: formatNumber(state.waiting) })}
    </button>
  )
}
