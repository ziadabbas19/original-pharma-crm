import { registerPlugin } from '@capacitor/core'
import { normalizeSignals, unknownSignals } from '../device-signals'
import type { DeviceSignals, DeviceSignalsReader } from '../types'

/** Local native plugin in android/app (DeviceSignalsPlugin.java). */
interface DeviceSignalsPlugin {
  getSignals(options: { force: boolean }): Promise<Partial<Record<keyof DeviceSignals, unknown>>>
}

const Native = registerPlugin<DeviceSignalsPlugin>('DeviceSignals')

const CACHE_MS = 5 * 60_000

/**
 * Developer options, mock location app, spoofing apps, automatic time, emulator and root signals.
 * The native side caches too; this cache only saves the bridge round trip. A failure never
 * reaches the rep: the app then reports "unknown" for every signal.
 */
export class CapacitorDeviceSignalsReader implements DeviceSignalsReader {
  private cached: { at: number; signals: DeviceSignals } | null = null
  private pending: Promise<DeviceSignals> | null = null

  read(options?: { force?: boolean }): Promise<DeviceSignals> {
    const force = options?.force === true
    if (!force && this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return Promise.resolve(this.cached.signals)
    }
    if (!force && this.pending) return this.pending
    const run = Native.getSignals({ force })
      .then((raw) => normalizeSignals(raw, 'android'))
      .catch(() => unknownSignals('android'))
      .then((signals) => {
        this.cached = { at: Date.now(), signals }
        return signals
      })
      .finally(() => {
        if (this.pending === run) this.pending = null
      })
    this.pending = run
    return run
  }
}
