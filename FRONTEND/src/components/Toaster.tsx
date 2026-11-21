import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  WifiOffIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { ToastTone } from '@/lib/errors/types'
import { toast, type Toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const TONE: Record<ToastTone, { icon: LucideIcon; className: string }> = {
  error: { icon: AlertTriangleIcon, className: 'border-destructive/30 bg-destructive-soft text-destructive' },
  warning: { icon: WifiOffIcon, className: 'border-warning/40 bg-warning-soft text-warning-soft-foreground' },
  info: { icon: InfoIcon, className: 'border-primary/30 bg-primary-soft text-primary-soft-foreground' },
  success: { icon: CheckCircle2Icon, className: 'border-success/30 bg-green-soft text-green-text' },
}

/**
 * Renders the toasts of lib/toast. Bottom of the screen on phones (above the floating tab bar and
 * the safe area), top end on wide screens. Polite live region so screen readers announce them.
 */
export function Toaster() {
  const items = useSyncExternalStore(toast.subscribe, toast.snapshot, toast.snapshot)
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:top-4 md:bottom-auto md:items-end md:ltr:right-4 md:rtl:left-4"
      data-testid="toaster"
    >
      {items.map((item) => (
        <ToastItem key={item.id} item={item} />
      ))}
    </div>
  )
}

function ToastItem({ item }: { item: Toast }) {
  const { t } = useTranslation()
  const tone = TONE[item.tone]
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-control border px-4 py-3 text-sm shadow-float',
        tone.className,
      )}
      data-testid="toast"
      data-tone={item.tone}
    >
      <tone.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="leading-relaxed font-medium">{item.message}</p>
        {item.reference && (
          <p className="mt-0.5 text-xs opacity-80 select-all" data-testid="toast-reference">
            {item.reference}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(item.id)}
        className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={t('common.close')}
      >
        <XIcon className="size-4" aria-hidden />
      </button>
    </div>
  )
}
