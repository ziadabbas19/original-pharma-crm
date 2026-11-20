import BackgroundGeolocation, {
  type Config,
  type Location,
  type Subscription,
} from '@transistorsoft/capacitor-background-geolocation'
import i18n from '@/lib/i18n'
import { API_BASE_URL } from '@/lib/api-client'
import type {
  DeviceSignals,
  GeoFix,
  LocationTracker,
  ObservedFix,
  StartTrackingOptions,
  TrackingProfile,
  UploaderSession,
} from '../types'

/**
 * Shape of every uploaded point, built natively by the plugin (JS is not involved
 * in uploads). Must match LocationPointDto on the server. `mock` is Android's
 * "fix came from a mock provider" flag and is sent with every point. Altitude, the
 * motion activity and the device time (`recorded_at`) feed the server's plausibility
 * checks; servers that do not know them ignore them.
 */
export const LOCATION_TEMPLATE =
  '{"lat":<%= latitude %>,"lng":<%= longitude %>,"accuracy":<%= accuracy %>,' +
  '"timestamp":"<%= timestamp %>","speed":<%= speed %>,"heading":<%= heading %>,' +
  '"batteryLevel":<%= battery.level %>,"isMock":<%= mock %>,"isMoving":<%= is_moving %>,"uuid":"<%= uuid %>",' +
  '"altitude":<%= altitude %>,"activityType":"<%= activity.type %>","activityConfidence":<%= activity.confidence %>,' +
  '"deviceTime":"<%= recorded_at %>"}'

/** Signals shared with the device-health inspector. */
export const nativeSignals = {
  lastMockSeen: false,
}

/**
 * Native Android tracking with the Transistorsoft background geolocation SDK:
 *   - foreground service with a persistent notification while the day is running
 *   - motion detection: GPS off and no reporting while stationary (stopTimeout)
 *   - distanceFilter from the server profile (75 m normal, 20 m live)
 *   - balanced accuracy by default, high accuracy only for one-off fixes (visits)
 *   - points stored in the plugin's SQLite and uploaded natively in batches
 *   - keeps running after the app is swiped away (stopOnTerminate: false) and after reboot
 */
export class CapacitorLocationTracker implements LocationTracker {
  private readyPromise: Promise<void> | null = null
  private subscriptions: Subscription[] = []
  private readonly fixListeners = new Set<(fix: ObservedFix) => void>()
  /** Sent in every upload body (http.params), so the server sees them even while the app is closed. */
  private signals: DeviceSignals | null = null

  /** The SDK must be configured once per launch, even when tracking is off. */
  ensureReady(): Promise<void> {
    this.readyPromise ??= (async () => {
      this.subscriptions.push(
        BackgroundGeolocation.onLocation(
          (location) => this.observe(location),
          () => {},
        ),
        // Stationary reps still send one fix per heartbeat so the dashboard knows they are alive.
        BackgroundGeolocation.onHeartbeat(() => {
          void BackgroundGeolocation.getCurrentPosition({ samples: 1, persist: true, timeout: 30 }).catch(
            () => {},
          )
        }),
      )
      await BackgroundGeolocation.ready(baseConfig())
    })()
    return this.readyPromise
  }

  async start({ deviceId, profile, uploaderSession }: StartTrackingOptions): Promise<void> {
    await this.ensureReady()
    await BackgroundGeolocation.setConfig({
      ...profileConfig(profile, deviceId, this.signals),
      ...(uploaderSession ? { authorization: authorizationConfig(uploaderSession, deviceId) } : {}),
    })
    await BackgroundGeolocation.start()
  }

  async stop(): Promise<void> {
    await this.ensureReady()
    await BackgroundGeolocation.stop()
    await BackgroundGeolocation.sync().catch(() => [])
  }

  async isRunning(): Promise<boolean> {
    await this.ensureReady()
    return (await BackgroundGeolocation.getState()).enabled
  }

  async applyProfile(profile: TrackingProfile): Promise<void> {
    await this.ensureReady()
    const state = await BackgroundGeolocation.getState()
    const deviceId = String(state.http?.params?.deviceId ?? '')
    await BackgroundGeolocation.setConfig(profileConfig(profile, deviceId, this.signals))
  }

  async getCurrentPosition(options?: { highAccuracy?: boolean; timeoutMs?: number }): Promise<GeoFix> {
    await this.ensureReady()
    const location = await BackgroundGeolocation.getCurrentPosition({
      samples: options?.highAccuracy ? 3 : 1,
      desiredAccuracy: options?.highAccuracy
        ? BackgroundGeolocation.DesiredAccuracy.High
        : BackgroundGeolocation.DesiredAccuracy.Medium,
      timeout: Math.round((options?.timeoutMs ?? 30_000) / 1000),
      maximumAge: 0,
      persist: false,
    })
    this.observe(location)
    return toFix(location)
  }

  async flush(): Promise<number> {
    await this.ensureReady()
    await BackgroundGeolocation.sync().catch(() => [])
    return BackgroundGeolocation.getCount()
  }

  async pendingCount(): Promise<number> {
    await this.ensureReady()
    return BackgroundGeolocation.getCount()
  }

  async setDeviceSignals(signals: DeviceSignals): Promise<void> {
    this.signals = signals
    await this.ensureReady()
    const params = (await BackgroundGeolocation.getState()).http?.params ?? {}
    await BackgroundGeolocation.setConfig({ http: { params: { ...params, deviceSignals: signals } } })
  }

  onFixObserved(handler: (fix: ObservedFix) => void): () => void {
    this.fixListeners.add(handler)
    return () => {
      this.fixListeners.delete(handler)
    }
  }

  private observe(location: Location) {
    const isMock = location.mock === true
    nativeSignals.lastMockSeen = isMock
    const time = new Date(location.timestamp)
    const fix: ObservedFix = {
      isMock,
      at: Number.isNaN(time.getTime()) ? new Date().toISOString() : time.toISOString(),
    }
    for (const listener of this.fixListeners) {
      try {
        listener(fix)
      } catch {
        // a listener failing must never stop location updates
      }
    }
  }
}

function baseConfig(): Config {
  return {
    geolocation: {
      desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.Medium,
      distanceFilter: 75,
      stopTimeout: 5,
      locationAuthorizationRequest: 'Always',
      // The setup wizard explains permissions itself; no plugin pop-ups.
      disableLocationAuthorizationAlert: true,
    },
    activity: {
      stopOnStationary: false,
    },
    app: {
      stopOnTerminate: false,
      startOnBoot: true,
      heartbeatInterval: 600,
      notification: {
        title: i18n.t('tracking.notification.title'),
        text: i18n.t('tracking.notification.text'),
        sticky: true,
      },
      backgroundPermissionRationale: {
        title: i18n.t('tracking.rationale.title'),
        message: i18n.t('tracking.rationale.message'),
        positiveAction: i18n.t('tracking.rationale.positive'),
        negativeAction: i18n.t('common.cancel'),
      },
    },
    http: {
      url: `${API_BASE_URL}/api/tracking/locations`,
      autoSync: true,
      batchSync: true,
      maxBatchSize: 50,
      autoSyncThreshold: 10,
      rootProperty: 'points',
      params: { source: 'native' },
      timeout: 60_000,
    },
    persistence: {
      locationTemplate: LOCATION_TEMPLATE,
      timestampFormat: 'iso',
      maxDaysToPersist: 7,
    },
  }
}

function profileConfig(profile: TrackingProfile, deviceId: string, signals: DeviceSignals | null): Config {
  return {
    geolocation: {
      distanceFilter: profile.distanceFilterMeters,
      desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.Medium,
    },
    app: {
      heartbeatInterval: profile.heartbeatIntervalSeconds,
    },
    http: {
      url: `${API_BASE_URL}/api/tracking/locations`,
      autoSyncThreshold: profile.uploadBatchSize,
      params: { deviceId, source: 'native', ...(signals ? { deviceSignals: signals } : {}) },
    },
  }
}

/**
 * The uploader has its own token pair (POST /api/auth/background-session) and
 * refreshes it natively, so it keeps working while the app is closed.
 */
function authorizationConfig(
  session: UploaderSession,
  deviceId: string,
): NonNullable<Config['authorization']> {
  return {
    strategy: BackgroundGeolocation.AuthorizationStrategy.Jwt,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? undefined,
    refreshUrl: `${API_BASE_URL}/api/auth/refresh-native`,
    refreshPayload: { refreshToken: '{refreshToken}', deviceId },
    expires: Math.floor(new Date(session.expiresAt).getTime() / 1000),
  }
}

function toFix(location: Location): GeoFix {
  const c = location.coords
  return {
    lat: c.latitude,
    lng: c.longitude,
    accuracy: c.accuracy,
    timestamp: new Date(location.timestamp).toISOString(),
    speed: c.speed !== undefined && c.speed >= 0 ? c.speed : null,
    heading: c.heading !== undefined && c.heading >= 0 ? c.heading : null,
    batteryLevel: location.battery?.level ?? null,
    isMock: location.mock === true,
    altitude: c.altitude ?? null,
  }
}
