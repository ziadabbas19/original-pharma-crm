import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
  getTrackingMonitorGetDevicesQueryKey,
  getTrackingMonitorGetFlagsQueryKey,
  getTrackingMonitorGetPresenceQueryKey,
} from '@/api/generated/endpoints'
import type { LivePositionDto, NotificationDto, TrackingFlagDto } from '@/api/generated/model'
import { emitNoteReminder } from '@/features/notes/live-reminders'
import { API_BASE_URL } from '@/lib/api-client'
import { invalidateApi } from '@/lib/invalidate-api'
import { refreshSession } from '@/lib/session'
import { store, useAppDispatch, useAppSelector } from '@/store'
import {
  deviceHealthChanged,
  flagRaised,
  hubConnectionChanged,
  positionUpdated,
  presenceChanged,
} from '@/store/slices/liveLocationsSlice'
import type { DeviceHealthChangeDto, PresenceChangeDto } from './hub-events'

/**
 * Realtime connection to /hubs/tracking. The server places the connection in the user's own inbox
 * group (notifications) and in groups matching their tracking:view-live scope when it connects, so
 * the connection is rebuilt whenever the permissions version changes. Dashboards keep it open; the
 * rep app only while it is in the foreground (battery).
 */
export function useTrackingHub(enabled = true): void {
  const dispatch = useAppDispatch()
  const queryClient = useQueryClient()
  const permissionsVersion = useAppSelector((s) => s.permissions.version)

  useEffect(() => {
    if (!enabled) return

    const connection = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/tracking`, {
        accessTokenFactory: async () => {
          const { expiresAt, accessToken } = store.getState().auth
          if (expiresAt && new Date(expiresAt).getTime() - Date.now() < 30_000) await refreshSession()
          return store.getState().auth.accessToken ?? accessToken ?? ''
        },
      })
      .withAutomaticReconnect()
      .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
      .build()

    // Prefix keys: refresh every cached variant (any filter params).
    const flagsKey = getTrackingMonitorGetFlagsQueryKey().slice(0, 1)
    const devicesKey = getTrackingMonitorGetDevicesQueryKey().slice(0, 1)

    // Handlers must not return a value: SignalR treats a return value as a client result
    // for the server and logs an error when the server did not ask for one.
    connection.on('PositionUpdated', (p: LivePositionDto) => {
      dispatch(positionUpdated(p))
    })
    connection.on('PresenceChanged', (c: PresenceChangeDto) => {
      dispatch(presenceChanged(c))
    })
    connection.on('DeviceHealthChanged', (c: DeviceHealthChangeDto) => {
      dispatch(deviceHealthChanged(c))
      void queryClient.invalidateQueries({ queryKey: devicesKey })
    })
    connection.on('FlagRaised', (f: TrackingFlagDto) => {
      dispatch(flagRaised({ userId: f.userId }))
      void queryClient.invalidateQueries({ queryKey: flagsKey })
      void queryClient.invalidateQueries({ queryKey: devicesKey })
    })
    connection.on('NotificationReceived', (notification?: NotificationDto) => {
      // A decision on an order, an answer on a visit or a note reminder: the screens showing them follow at once.
      void invalidateApi(queryClient, '/api/notifications', '/api/orders', '/api/visits', '/api/notes')
      if (notification?.type === 'noteReminder') emitNoteReminder(notification)
    })
    connection.onreconnecting(() => dispatch(hubConnectionChanged(false)))
    connection.onreconnected(() => {
      dispatch(hubConnectionChanged(true))
      // Events may have been missed while offline: resync the snapshot.
      void queryClient.invalidateQueries({ queryKey: getTrackingMonitorGetPresenceQueryKey() })
      void invalidateApi(queryClient, '/api/notifications')
    })
    connection.onclose(() => dispatch(hubConnectionChanged(false)))

    let cancelled = false
    // Started on the next tick: React StrictMode (dev) mounts, unmounts and mounts again
    // synchronously, so the throwaway mount never opens a socket it would abort mid-negotiation.
    const startTimer = window.setTimeout(() => {
      connection
        .start()
        .then(() => {
          if (!cancelled) dispatch(hubConnectionChanged(true))
        })
        .catch(() => dispatch(hubConnectionChanged(false)))
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      if (connection.state !== HubConnectionState.Disconnected) void connection.stop()
    }
  }, [enabled, permissionsVersion, dispatch, queryClient])
}
