import { App } from '@capacitor/app'
import { Device } from '@capacitor/device'
import { PushNotifications as Push } from '@capacitor/push-notifications'
import { SecureStorage as KeystoreStorage } from '@aparajita/capacitor-secure-storage'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type {
  AppInfo,
  AppLifecycle,
  DeviceIntegrity,
  OfflineDb,
  PermissionState,
  Platform,
  PushNotifications,
  QueuedItem,
  SecureStorage,
} from '../types'
import { CapacitorDeviceHealthInspector } from './device-health'
import { CapacitorDeviceSignalsReader } from './device-signals'
import { CapacitorFileExporter } from './files'
import { CapacitorLocationTracker } from './location-tracker'

/** Native Android implementation. */
export function createCapacitorPlatform(): Platform {
  const location = new CapacitorLocationTracker()
  const push = new CapacitorPush()
  const signals = new CapacitorDeviceSignalsReader()
  void location.ensureReady()

  return {
    kind: 'native',
    files: new CapacitorFileExporter(),
    location,
    secureStorage: new AndroidSecureStorage(),
    offlineDb: new SqliteOfflineDb(),
    push,
    integrity: new PlayIntegrity(),
    deviceHealth: new CapacitorDeviceHealthInspector(location, push, signals),
    signals,
    app: new CapacitorAppLifecycle(),
  }
}

/** Android Keystore-backed storage (refresh token lives here). */
class AndroidSecureStorage implements SecureStorage {
  async get(key: string) {
    return KeystoreStorage.getItem(key)
  }
  async set(key: string, value: string) {
    await KeystoreStorage.setItem(key, value)
  }
  async remove(key: string) {
    await KeystoreStorage.removeItem(key)
  }
}

/** SQLite outbox for offline writes. Location points are queued by the tracking SDK itself. */
class SqliteOfflineDb implements OfflineDb {
  private static readonly NAME = 'original_pharma'
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite)
  private connection: Promise<SQLiteDBConnection> | null = null

  private db(): Promise<SQLiteDBConnection> {
    this.connection ??= (async () => {
      const consistent = (await this.sqlite.checkConnectionsConsistency()).result
      const exists = (await this.sqlite.isConnection(SqliteOfflineDb.NAME, false)).result
      const db =
        consistent && exists
          ? await this.sqlite.retrieveConnection(SqliteOfflineDb.NAME, false)
          : await this.sqlite.createConnection(SqliteOfflineDb.NAME, false, 'no-encryption', 1, false)
      await db.open()
      await db.execute(
        `CREATE TABLE IF NOT EXISTS outbox (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           kind TEXT NOT NULL,
           payload TEXT NOT NULL,
           created_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS ix_outbox_kind ON outbox (kind, id);`,
      )
      return db
    })()
    return this.connection
  }

  async enqueue(kind: string, payload: unknown): Promise<void> {
    const db = await this.db()
    await db.run('INSERT INTO outbox (kind, payload, created_at) VALUES (?, ?, ?)', [
      kind,
      JSON.stringify(payload),
      new Date().toISOString(),
    ])
  }

  async peek<T = unknown>(kind: string, limit: number): Promise<QueuedItem<T>[]> {
    const db = await this.db()
    const result = await db.query(
      'SELECT id, kind, payload, created_at FROM outbox WHERE kind = ? ORDER BY id LIMIT ?',
      [kind, limit],
    )
    return (result.values ?? []).map((row) => ({
      id: Number(row.id),
      kind: String(row.kind),
      payload: JSON.parse(String(row.payload)) as T,
      createdAt: String(row.created_at),
    }))
  }

  async remove(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    const db = await this.db()
    await db.run(`DELETE FROM outbox WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  }

  async count(kind?: string): Promise<number> {
    const db = await this.db()
    const result = kind
      ? await db.query('SELECT COUNT(*) AS n FROM outbox WHERE kind = ?', [kind])
      : await db.query('SELECT COUNT(*) AS n FROM outbox')
    return Number(result.values?.[0]?.n ?? 0)
  }
}

/** Firebase Cloud Messaging through @capacitor/push-notifications. */
class CapacitorPush implements PushNotifications {
  private readonly enabled = import.meta.env.VITE_FCM_ENABLED === 'true'

  async permission(): Promise<PermissionState> {
    return toState((await Push.checkPermissions()).receive)
  }

  async requestPermission(): Promise<PermissionState> {
    return toState((await Push.requestPermissions()).receive)
  }

  async register(): Promise<string | null> {
    // Registering without google-services.json crashes the app; see VITE_FCM_ENABLED.
    if (!this.enabled) return null

    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(null), 15_000)
      void Push.addListener('registration', (token) => {
        window.clearTimeout(timeout)
        resolve(token.value)
      })
      void Push.addListener('registrationError', () => {
        window.clearTimeout(timeout)
        resolve(null)
      })
      void Push.register()
    })
  }

  onData(handler: (data: Record<string, string>) => void) {
    const listener = Push.addListener('pushNotificationReceived', (notification) => {
      handler((notification.data ?? {}) as Record<string, string>)
    })
    return () => void listener.then((l) => l.remove())
  }
}

function toState(receive: string): PermissionState {
  if (receive === 'granted') return 'granted'
  if (receive === 'denied') return 'denied'
  return 'prompt'
}

/** Play Integrity attestation. */
class PlayIntegrity implements DeviceIntegrity {
  // TODO: add a small native plugin around com.google.android.play.core.integrity
  // (StandardIntegrityManager) that returns a token for a server-issued nonce, and
  // send it with "Start my day". The server verifier is stubbed the same way.
  async getToken(): Promise<string | null> {
    return null
  }
}

class CapacitorAppLifecycle implements AppLifecycle {
  private cached: AppInfo | null = null

  async info(): Promise<AppInfo> {
    if (this.cached) return this.cached
    const [device, id, app] = await Promise.all([Device.getInfo(), Device.getId(), App.getInfo()])
    this.cached = {
      platform: device.platform === 'ios' ? 'ios' : 'android',
      isNative: true,
      isStandalone: true,
      appVersion: app.version,
      manufacturer: device.manufacturer ?? null,
      model: device.model ?? null,
      osVersion: device.osVersion ?? null,
      androidSdk: device.androidSDKVersion ?? null,
      deviceId: `and-${id.identifier}`,
    }
    return this.cached
  }

  onResume(handler: () => void) {
    const listener = App.addListener('resume', handler)
    return () => void listener.then((l) => l.remove())
  }
}
