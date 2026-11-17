import { useCallback, useEffect } from 'react'
import type { HealthReportTrigger } from '@/api/generated/model'
import { listenForTrackingPushes, syncShift } from '@/features/tracking/tracking-service'
import { platform } from '@/lib/platform'
import { store, useAppDispatch } from '@/store'
import { healthInspected } from '@/store/slices/trackingSlice'
import { evaluateHealth, reportHealth } from './health'

const REPORT_EVERY_MS = 15 * 60_000
let lastReport: { at: number; key: string } | null = null

/**
 * Re-checks tracking readiness on app open and every resume, stores the result
 * for the banner, reports it to the server (when it changed or every 15 min),
 * and re-syncs the shift. Mounted once by the rep layout.
 */
export function useTrackingHealthMonitor(): () => Promise<void> {
  const dispatch = useAppDispatch()

  const check = useCallback(
    async (trigger: HealthReportTrigger) => {
      const p = platform()
      const [health, info] = await Promise.all([p.deviceHealth.inspect(), p.app.info()])
      const issues = evaluateHealth(health, p.kind)
      dispatch(healthInspected({ health, issues }))

      const key = JSON.stringify(health)
      const due = !lastReport || lastReport.key !== key || Date.now() - lastReport.at > REPORT_EVERY_MS
      if (due && store.getState().auth.status === 'authenticated') {
        lastReport = { at: Date.now(), key }
        await reportHealth(health, info, trigger).catch(() => (lastReport = null))
      }
    },
    [dispatch],
  )

  useEffect(() => {
    void check('appOpen')
    void syncShift().catch(() => {})
    const offResume = platform().app.onResume(() => {
      void check('resume')
      void syncShift().catch(() => {})
    })
    const offPush = listenForTrackingPushes()
    return () => {
      offResume()
      offPush()
    }
  }, [check])

  return useCallback(() => check('manual'), [check])
}
