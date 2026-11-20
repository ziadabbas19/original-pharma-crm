import { useCallback, useEffect } from 'react'
import { useDocumentVisible } from '@/hooks/use-document-visible'
import { platform } from '@/lib/platform'
import { store, useAppSelector } from '@/store'
import { mockWatchChanged } from '@/store/slices/trackingSlice'
import { refreshDeviceSignals } from './device-signals-sync'
import { reportMockLocation } from './integrity-report'
import {
  checkFinished,
  checkRequested,
  markReported,
  observeFix,
  reportDue,
  type MockWatchState,
} from './mock-watch'

let checking = false
let reporting = false

function update(next: MockWatchState) {
  if (next !== store.getState().tracking.mockWatch) store.dispatch(mockWatchChanged(next))
}

/** Takes one fresh fix and feeds the result into the episode. Never throws. */
async function recheck() {
  if (checking) return
  checking = true
  try {
    let isMock: boolean | null = null
    try {
      isMock = await platform().deviceHealth.checkMockLocation()
    } catch {
      isMock = null
    }
    update(checkFinished(store.getState().tracking.mockWatch, isMock, Date.now()))
    // The rep may have switched the fake location app off: read the settings again.
    if (isMock !== null) void refreshDeviceSignals(true)
  } finally {
    checking = false
  }
}

async function report(state: MockWatchState) {
  if (reporting) return
  reporting = true
  try {
    await reportMockLocation(state)
    update(markReported(store.getState().tracking.mockWatch, Date.now()))
  } catch {
    // Offline or refused: the points themselves carry the mock flag; try again with the next change.
  } finally {
    reporting = false
  }
}

/**
 * Watches every fix for a fake (mock) location while the rep app is open. On one it marks tracking
 * as untrusted, reports it to the server, and checks again on its own (only while the app is on
 * screen, with a growing pause, so it costs no noticeable battery) until a real fix arrives.
 * Also keeps the device signals fresh for uploads. Mounted once by the rep layout.
 */
export function useLocationIntegrity(): { checkNow: () => void } {
  const state = useAppSelector((s) => s.tracking.mockWatch)
  const visible = useDocumentVisible()

  useEffect(() => {
    void refreshDeviceSignals()
    const offResume = platform().app.onResume(() => void refreshDeviceSignals())
    const offFix = platform().location.onFixObserved((fix) =>
      update(observeFix(store.getState().tracking.mockWatch, fix, Date.now())),
    )
    return () => {
      offResume()
      offFix()
    }
  }, [])

  useEffect(() => {
    if (reportDue(state, Date.now())) void report(state)
  }, [state])

  useEffect(() => {
    if (!state.active || !visible || state.nextCheckAt === null) return
    const timer = window.setTimeout(() => void recheck(), Math.max(0, state.nextCheckAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [state.active, state.nextCheckAt, visible])

  const checkNow = useCallback(
    () => update(checkRequested(store.getState().tracking.mockWatch, Date.now())),
    [],
  )
  return { checkNow }
}
