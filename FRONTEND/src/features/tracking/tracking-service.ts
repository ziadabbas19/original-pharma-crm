import {
  trackingEndShift,
  trackingGetConfig,
  trackingGetCurrentShift,
  trackingStartShift,
} from '@/api/generated/endpoints'
import type { TrackingConfigDto } from '@/api/generated/model'
import { loadActiveVisit } from '@/features/visits/active-visit'
import { platform, type GeoFix } from '@/lib/platform'
import { store } from '@/store'
import { shiftChanged } from '@/store/slices/trackingSlice'
import { applyCollection, collectionMode, rememberConfig, stopCollection, trackingSource } from './collection'

/**
 * Tracking runs only between "Start my day" and "End my day". The server is the source of truth for the
 * shift; the device follows it. In visit-only mode (the location visibility setting) the tracker runs only
 * while a visit is in progress, see collection.ts.
 */

async function tryFix(): Promise<GeoFix | null> {
  try {
    return await platform().location.getCurrentPosition({ timeoutMs: 15_000 })
  } catch {
    return null
  }
}

export async function startDay(): Promise<void> {
  const p = platform()
  const { deviceId } = await p.app.info()
  // Visit-only: where the day starts is nobody's business, so no fix is taken (the server ignores it too).
  const fix = collectionMode() === 'visitOnly' ? null : await tryFix()
  const nonce = crypto.randomUUID()
  const integrityToken = await p.integrity.getToken(nonce)

  const { shift, config } = await trackingStartShift({
    deviceId,
    source: trackingSource(),
    lat: fix?.lat ?? null,
    lng: fix?.lng ?? null,
    accuracy: fix?.accuracy ?? null,
    integrityToken,
    integrityNonce: integrityToken ? nonce : null,
  })

  store.dispatch(shiftChanged(shift))
  rememberConfig(config)
  await applyCollection((await loadActiveVisit()) !== null, config)
}

export async function endDay(): Promise<void> {
  const p = platform()
  const { deviceId } = await p.app.info()
  await p.location.flush().catch(() => 0)
  const fix = collectionMode() === 'visitOnly' ? null : await tryFix()
  const shift = await trackingEndShift({ deviceId, lat: fix?.lat ?? null, lng: fix?.lng ?? null })
  await stopCollection()
  store.dispatch(shiftChanged(shift.status === 'active' ? shift : null))
}

/**
 * Brings the device in line with the server (app open, resume): the shift, the collection mode, and
 * whether the tracker should run (restarted after a PWA reload, stopped when the day was closed elsewhere
 * or, in visit-only mode, when no visit is open).
 */
export async function syncShift(): Promise<void> {
  const { shift } = await trackingGetCurrentShift()
  store.dispatch(shiftChanged(shift))
  let config: TrackingConfigDto | undefined
  if (shift) {
    config = await trackingGetConfig()
    rememberConfig(config)
  }
  await applyCollection((await loadActiveVisit()) !== null, config)
}

/** Pulls the current profile (normal/live) and applies it. Called after a push. */
export async function refreshTrackingConfig(): Promise<TrackingConfigDto> {
  const config = await trackingGetConfig()
  rememberConfig(config)
  if (await platform().location.isRunning()) await platform().location.applyProfile(config)
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
