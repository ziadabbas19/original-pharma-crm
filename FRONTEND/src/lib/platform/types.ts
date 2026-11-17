/**
 * Platform abstraction. Feature code talks only to these interfaces; the
 * implementation is picked at startup:
 *   - capacitor/: native Android app (background plugin, SQLite, Keystore, FCM)
 *   - web/:       browser dashboard and the installable PWA (foreground only)
 */

export type PlatformKind = 'native' | 'pwa'

export type LocationPermission = 'none' | 'whileInUse' | 'always'

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'notRequired' | 'unknown'

export interface GeoFix {
  lat: number
  lng: number
  accuracy: number
  /** ISO 8601, device clock. */
  timestamp: string
  speed: number | null
  heading: number | null
  batteryLevel: number | null
  /** Android reports when the fix came from a mock provider. Browsers cannot tell (always false). */
  isMock: boolean
}

/** Reporting profile from GET /api/tracking/config. */
export interface TrackingProfile {
  mode: string
  distanceFilterMeters: number
  uploadBatchSize: number
  uploadIntervalSeconds: number
  heartbeatIntervalSeconds: number
  liveUntil: string | null
}

/** Separate token pair for the native background uploader (see /api/auth/background-session). */
export interface UploaderSession {
  accessToken: string
  refreshToken: string | null
  expiresAt: string
}

export interface StartTrackingOptions {
  deviceId: string
  profile: TrackingProfile
  /** Native only: the background uploader authenticates on its own. */
  uploaderSession?: UploaderSession
}

export interface LocationTracker {
  start(options: StartTrackingOptions): Promise<void>
  stop(): Promise<void>
  isRunning(): Promise<boolean>
  /** Switch reporting profile (normal <-> live) without restarting. */
  applyProfile(profile: TrackingProfile): Promise<void>
  /** One fix. High accuracy is used only for visit check-in/out and the setup check. */
  getCurrentPosition(options?: { highAccuracy?: boolean; timeoutMs?: number }): Promise<GeoFix>
  /** Upload queued points now; resolves to the number still pending. */
  flush(): Promise<number>
  pendingCount(): Promise<number>
}

export interface SecureStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

export interface QueuedItem<T = unknown> {
  id: number
  kind: string
  payload: T
  createdAt: string
}

/** Small durable outbox for work that must survive being offline or the app being killed. */
export interface OfflineDb {
  enqueue(kind: string, payload: unknown): Promise<void>
  peek<T = unknown>(kind: string, limit: number): Promise<QueuedItem<T>[]>
  remove(ids: number[]): Promise<void>
  count(kind?: string): Promise<number>
}

export interface PushNotifications {
  permission(): Promise<PermissionState>
  requestPermission(): Promise<PermissionState>
  /** Registers for push and resolves to the device token (null when unavailable). */
  register(): Promise<string | null>
  /** Silent data messages (e.g. "tracking-config-changed"). Returns an unsubscribe function. */
  onData(handler: (data: Record<string, string>) => void): () => void
}

export interface DeviceIntegrity {
  /** Attestation token for the server to verify (Play Integrity on Android). */
  getToken(nonce: string): Promise<string | null>
}

export interface DeviceHealthState {
  locationPermission: LocationPermission
  preciseLocation: boolean
  notificationPermission: PermissionState
  locationServicesEnabled: boolean
  /** null when the platform has no such setting. */
  batteryOptimizationIgnored: boolean | null
  mockLocationDetected: boolean
  developerOptionsEnabled: boolean | null
  powerSaveMode: boolean | null
}

export interface DeviceHealthInspector {
  inspect(): Promise<DeviceHealthState>
  requestLocationWhileInUse(): Promise<LocationPermission>
  requestLocationAlways(): Promise<LocationPermission>
  requestPreciseLocation(): Promise<boolean>
  openAppSettings(): Promise<void>
  openLocationSettings(): Promise<void>
  openNotificationSettings(): Promise<void>
  requestIgnoreBatteryOptimizations(): Promise<void>
  /** Opens the manufacturer's own power manager screen. False when the device has none. */
  openOemPowerSettings(): Promise<boolean>
  openDeveloperOptions(): Promise<void>
  /** Takes a fresh fix and reports whether it came from a mock provider (null = cannot tell). */
  checkMockLocation(): Promise<boolean | null>
}

export interface AppInfo {
  platform: 'android' | 'ios' | 'web'
  isNative: boolean
  /** Installed from the home screen (PWA) or native app. */
  isStandalone: boolean
  appVersion: string
  manufacturer: string | null
  model: string | null
  osVersion: string | null
  /** Android API level (null elsewhere). */
  androidSdk: number | null
  /** Stable per-install id sent with every tracking request. */
  deviceId: string
}

export interface AppLifecycle {
  info(): Promise<AppInfo>
  /** Fires when the app comes back to the foreground. Returns an unsubscribe function. */
  onResume(handler: () => void): () => void
}

export interface Platform {
  kind: PlatformKind
  location: LocationTracker
  secureStorage: SecureStorage
  offlineDb: OfflineDb
  push: PushNotifications
  integrity: DeviceIntegrity
  deviceHealth: DeviceHealthInspector
  app: AppLifecycle
}
