import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { notificationsMarkRead, useNotificationsUnreadCount } from '@/api/generated/endpoints'
import { invalidateApi } from '@/lib/invalidate-api'

/** Unread count for the bell. The hub refreshes it live; polling covers a closed connection. */
export function useUnreadNotifications(): number {
  const unread = useNotificationsUnreadCount({ query: { refetchInterval: 60_000, staleTime: 15_000 } })
  return unread.data?.unread ?? 0
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useCallback(
    async (ids: string[]) => {
      const result = await notificationsMarkRead({ ids })
      await invalidateApi(queryClient, '/api/notifications')
      return result
    },
    [queryClient],
  )
}
