import { platform, type DeviceSignals } from '@/lib/platform'
import { store } from '@/store'
import { deviceSignalsRead } from '@/store/slices/trackingSlice'

let pushedKey: string | null = null

/** Everything except the time they were read: unchanged signals are not pushed to the uploader again. */
function keyOf(signals: DeviceSignals): string {
  return JSON.stringify({ ...signals, collectedAt: '' })
}

/**
 * Reads the device signals (cached by the platform), keeps them in the store for visit check-in
 * and check-out, and hands them to the location uploader so every batch carries them. Never throws.
 */
export async function refreshDeviceSignals(force = false): Promise<DeviceSignals | null> {
  try {
    const p = platform()
    const signals = await p.signals.read({ force })
    store.dispatch(deviceSignalsRead(signals))
    const key = keyOf(signals)
    if (key !== pushedKey) {
      await p.location.setDeviceSignals(signals)
      pushedKey = key
    }
    return signals
  } catch {
    return null
  }
}

/** The latest signals read on this device, for requests that carry them (visits, reports). */
export function currentDeviceSignals(): DeviceSignals | null {
  return store.getState().tracking.deviceSignals
}
