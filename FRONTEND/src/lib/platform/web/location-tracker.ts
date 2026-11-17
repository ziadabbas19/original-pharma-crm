import { trackingPostLocations } from '@/api/generated/endpoints'
import type { LocationPointDto } from '@/api/generated/model'
import { ApiError } from '@/lib/api-client'
import { distanceMeters } from '@/lib/geo'
import type { GeoFix, LocationTracker, OfflineDb, StartTrackingOptions, TrackingProfile } from '../types'

const QUEUE_KIND = 'location'
const MAX_BATCH = 200

/**
 * PWA tracking. Browsers stop geolocation when the page is hidden, so this
 * tracks only while the page is visible, which is what iPhone reps get today.
 *
 * Battery rules (deliberate):
 *   - watchPosition only while document.visibilityState === 'visible'
 *   - points are thinned by distance / heartbeat before queueing
 *   - uploads are batched and throttled (uploadIntervalSeconds)
 *   - no Wake Lock and no persistent socket from the phone
 */
export class WebLocationTracker implements LocationTracker {
  private running = false
  private deviceId = ''
  private profile: TrackingProfile | null = null
  private watchId: number | null = null
  private uploadTimer: number | null = null
  private lastQueued: { lat: number; lng: number; at: number } | null = null
  private flushing: Promise<number> | null = null

  constructor(private readonly queue: OfflineDb) {
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  async start({ deviceId, profile }: StartTrackingOptions): Promise<void> {
    this.deviceId = deviceId
    this.profile = profile
    this.running = true
    if (document.visibilityState === 'visible') this.resume()
  }

  async stop(): Promise<void> {
    this.running = false
    this.pause()
    await this.flush()
  }

  async isRunning(): Promise<boolean> {
    return this.running
  }

  async applyProfile(profile: TrackingProfile): Promise<void> {
    this.profile = profile
    if (this.running && document.visibilityState === 'visible') {
      this.pause()
      this.resume()
    }
  }

  getCurrentPosition(options?: { highAccuracy?: boolean; timeoutMs?: number }): Promise<GeoFix> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((pos) => resolve(toFix(pos)), reject, {
        enableHighAccuracy: options?.highAccuracy ?? false,
        timeout: options?.timeoutMs ?? 20_000,
        maximumAge: 0,
      })
    })
  }

  async pendingCount(): Promise<number> {
    return this.queue.count(QUEUE_KIND)
  }

  /** Uploads queued points in batches. Concurrent calls share one run. */
  flush(): Promise<number> {
    this.flushing ??= this.upload().finally(() => (this.flushing = null))
    return this.flushing
  }

  private async upload(): Promise<number> {
    if (!this.deviceId) return this.pendingCount()

    for (;;) {
      const batch = await this.queue.peek<LocationPointDto>(QUEUE_KIND, MAX_BATCH)
      if (batch.length === 0) return 0
      try {
        await trackingPostLocations({
          deviceId: this.deviceId,
          source: 'pwa',
          sentAt: new Date().toISOString(),
          points: batch.map((b) => b.payload),
        })
        await this.queue.remove(batch.map((b) => b.id))
      } catch (error) {
        // A rejected batch (validation) would block the queue forever; drop it. Keep it on network errors.
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 401 &&
          error.status !== 429
        ) {
          await this.queue.remove(batch.map((b) => b.id))
          continue
        }
        return this.pendingCount()
      }
    }
  }

  private readonly onVisibilityChange = () => {
    if (!this.running) return
    if (document.visibilityState === 'visible') {
      this.resume()
    } else {
      this.pause()
      void this.flush()
    }
  }

  private resume() {
    if (!this.profile || this.watchId !== null) return
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => void this.onFix(toFix(pos)),
      () => {},
      {
        enableHighAccuracy: false,
        maximumAge: 10_000,
        timeout: 60_000,
      },
    )
    this.uploadTimer = window.setInterval(() => void this.flush(), this.profile.uploadIntervalSeconds * 1000)
    void this.flush()
  }

  private pause() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    if (this.uploadTimer !== null) window.clearInterval(this.uploadTimer)
    this.watchId = null
    this.uploadTimer = null
  }

  private async onFix(fix: GeoFix) {
    const profile = this.profile
    if (!profile) return

    const now = Date.now()
    const last = this.lastQueued
    const moved = last ? distanceMeters(last.lat, last.lng, fix.lat, fix.lng) : Infinity
    const heartbeatDue = !last || now - last.at >= profile.heartbeatIntervalSeconds * 1000
    if (moved < profile.distanceFilterMeters && !heartbeatDue) return

    this.lastQueued = { lat: fix.lat, lng: fix.lng, at: now }
    const point: LocationPointDto = {
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      timestamp: fix.timestamp,
      speed: fix.speed,
      heading: fix.heading,
      batteryLevel: null,
      isMock: false,
      isMoving: moved >= profile.distanceFilterMeters,
      uuid: crypto.randomUUID(),
    }
    await this.queue.enqueue(QUEUE_KIND, point)

    if ((await this.pendingCount()) >= profile.uploadBatchSize) void this.flush()
  }
}

function toFix(pos: GeolocationPosition): GeoFix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    timestamp: new Date(pos.timestamp).toISOString(),
    speed: pos.coords.speed,
    heading: pos.coords.heading,
    batteryLevel: null,
    isMock: false,
  }
}
