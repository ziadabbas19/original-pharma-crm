import { Link } from '@tanstack/react-router'
import { BellIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import { useUnreadNotifications } from './use-notifications'

/** Bell with the unread count, linking to the notifications screen of the current app. */
export function NotificationBell({ to }: { to: '/admin/notifications' | '/rep/notifications' }) {
  const { t } = useTranslation()
  const unread = useUnreadNotifications()
  const label =
    unread > 0
      ? t('notifications.bellUnread', { count: unread, value: formatNumber(unread) })
      : t('notifications.title')
  return (
    <Button asChild variant="ghost" size="icon" className="relative" title={label}>
      <Link to={to} aria-label={label}>
        <BellIcon />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 font-semibold text-destructive-foreground tabular-nums ltr:-right-0.5 rtl:-left-0.5"
            aria-hidden
          >
            {unread > 99 ? '99+' : formatNumber(unread)}
          </span>
        )}
      </Link>
    </Button>
  )
}
