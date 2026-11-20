import { authBackgroundSession, trackingGetConfig } from '@/api/generated/endpoints'
import type { LocationSource, TrackingConfigDto } from '@/api/generated/model'
import { platform, type UploaderSession } from '@/lib/platform'
import { store } from '@/store'
import { configChanged, trackingRunningChanged } from '@/store/slices/trackingSlice'
import { shouldCollect, toCollectionMode, type CollectionMode } from './collection-rules'

/**
 * Starts and stops the location tracker so it follows the collection mode: in visit-only mode it runs
 * only while a visit is in progress. Every change goes through applyCollection, which compares what
 * should run with what runs, so repeated calls (app open, resume, visit start and end) are safe.
 */

const MODE_KEY = 'op.tracking.collectionMode'

export function trackingSource(): LocationSource {
  return platform().kind === 'native' ? 'native' : 'pwa'
}

/** Native uploader gets its own token pair so it can upload while the app is closed. */
export async function uploaderSession(deviceId: string): Promise<UploaderSession | undefined> {
  if (platform().kind !== 'native') return undefined
  const session = await authBackgroundSession({ deviceId })
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  }
}

/** The last mode the server gave (kept on the device for offline starts). Older servers mean all day. */
export function collectionMode(): CollectionMode {
  const fromConfig = toCollectionMode(store.getState().tracking.config?.collectionMode)
  if (fromConfig) return fromConfig
  try {
    return toCollectionMode(localStorage.getItem(MODE_KEY)) ?? 'allDay'
  } catch {
    return 'allDay'
  }
}

/** Keeps the server's profile and mode in the store and on the device. */
export function rememberConfig(config: TrackingConfigDto): void {
  store.dispatch(configChanged(config))
  const mode = toCollectionMode(config.collectionMode)
  if (!mode) return
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // ignore
  }
}

/** Starts or stops the tracker to match the mode, the day and the visit. Never throws. */
export async function applyCollection(visitInProgress: boolean, config?: TrackingConfigDto): Promise<void> {
  try {
    const p = platform()
    const want = shouldCollect({
      mode: config ? (toCollectionMode(config.collectionMode) ?? 'allDay') : collectionMode(),
      dayRunning: store.getState().tracking.shift !== null,
      visitInProgress,
    })
    const running = await p.location.isRunning()
    if (want && !running) {
      const profile = config ?? store.getState().tracking.config ?? (await trackingGetConfig())
      rememberConfig(profile)
      const { deviceId } = await p.app.info()
      await p.location.start({ deviceId, profile, uploaderSession: await uploaderSession(deviceId) })
    } else if (!want && running) {
      await p.location.stop()
    }
    store.dispatch(trackingRunningChanged(want))
  } catch {
    // Offline or the plugin is busy: the next app open or resume tries again.
  }
}

/** Sign-out and the end of the day: nothing keeps collecting. */
export async function stopCollection(): Promise<void> {
  try {
    const p = platform()
    if (await p.location.isRunning()) await p.location.stop()
  } catch {
    // ignore
  }
  store.dispatch(trackingRunningChanged(false))
}
