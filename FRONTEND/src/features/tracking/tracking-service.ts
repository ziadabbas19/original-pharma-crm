import {
  authBackgroundSession,
  trackingEndShift,
  trackingGetConfig,
  trackingGetCurrentShift,
  trackingStartShift,
} from '@/api/generated/endpoints'
import type { LocationSource, TrackingConfigDto } from '@/api/generated/model'
import { platform, type GeoFix, type UploaderSession } from '@/lib/platform'
import { store } from '@/store'
import { configChanged, shiftChanged, trackingRunningChanged } from '@/store/slices/trackingSlice'

/**
 * Tracking runs only between "Start my day" and "End my day". The server is
 * the source of truth for the shift; the device follows it.
 */

function source(): LocationSource {
  return platform().kind === 'native' ? 'native' : 'pwa'
}

async function tryFix(): Promise<GeoFix | null> {
  try {
    return await platform().location.getCurrentPosition({ timeoutMs: 15_000 })
  } catch {
    return null
  }
}

/** Native uploader gets its own token pair so it can upload while the app is closed. */
async function uploaderSession(deviceId: string): Promise<UploaderSession | undefined> {
  if (platform().kind !== 'native') return undefined
  const session = await authBackgroundSession({ deviceId })
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  }
}

export async function startDay(): Promise<void> {
  const p = platform()
  const { deviceId } = await p.app.info()
  const fix = await tryFix()
  const nonce = crypto.randomUUID()
  const integrityToken = await p.integrity.getToken(nonce)

  const { shift, config } = await trackingStartShift({
    deviceId,
    source: source(),
    lat: fix?.lat ?? null,
    lng: fix?.lng ?? null,
    accuracy: fix?.accuracy ?? null,
    integrityToken,
    integrityNonce: integrityToken ? nonce : null,
  })

  await p.location.start({ deviceId, profile: config, uploaderSession: await uploaderSession(deviceId) })
  store.dispatch(shiftChanged(shift))
  store.dispatch(configChanged(config))
  store.dispatch(trackingRunningChanged(true))
}

export async function endDay(): Promise<void> {
  const p = platform()
  const { deviceId } = await p.app.info()
  await p.location.flush().catch(() => 0)
  const fix = await tryFix()
  const shift = await trackingEndShift({ deviceId, lat: fix?.lat ?? null, lng: fix?.lng ?? null })
  await p.location.stop()
  store.dispatch(shiftChanged(shift.status === 'active' ? shift : null))
  store.dispatch(trackingRunningChanged(false))
}

/**
 * Brings the device in line with the server (app open, resume): restarts
 * tracking if a shift is active but tracking is off (e.g. PWA reload), stops it
 * if the shift was closed elsewhere.
 */
export async function syncShift(): Promise<void> {
  const p = platform()
  const { shift } = await trackingGetCurrentShift()
  store.dispatch(shiftChanged(shift))

  const running = await p.location.isRunning()
  if (shift && !running) {
    const config = await trackingGetConfig()
    const { deviceId } = await p.app.info()
    await p.location.start({ deviceId, profile: config, uploaderSession: await uploaderSession(deviceId) })
    store.dispatch(configChanged(config))
  } else if (!shift && running) {
    await p.location.stop()
  }
  store.dispatch(trackingRunningChanged(Boolean(shift)))
}

/** Pulls the current profile (normal/live) and applies it. Called after a push. */
export async function refreshTrackingConfig(): Promise<TrackingConfigDto> {
  const config = await trackingGetConfig()
  await platform().location.applyProfile(config)
  store.dispatch(configChanged(config))
  return config
}

/** Supervisor opened/closed live view: the server pushes "tracking-config-changed". */
export function listenForTrackingPushes(): () => void {
  return platform().push.onData((data) => {
    if (data.type === 'tracking-config-changed' && store.getState().tracking.shift) {
      void refreshTrackingConfig().catch(() => {})
    }
  })
}
