import { useEffect } from 'react'
import { trackingMonitorStartLiveView, trackingMonitorStopLiveView } from '@/api/generated/endpoints'

const HEARTBEAT_MS = 60_000

/**
 * While a supervisor watches one rep, keep a live-view lease open on the server.
 * The server wakes the rep's phone (FCM) to report more often, and drops back to
 * the battery-friendly profile when the lease expires or is released.
 */
export function useLiveView(repId: string | null): void {
  useEffect(() => {
    if (!repId) return
    const renew = () => void trackingMonitorStartLiveView(repId).catch(() => {})
    renew()
    const timer = window.setInterval(renew, HEARTBEAT_MS)
    return () => {
      window.clearInterval(timer)
      void trackingMonitorStopLiveView(repId).catch(() => {})
    }
  }, [repId])
}
