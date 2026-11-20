import { unknownSignals } from '../device-signals'
import type {
  AppInfo,
  AppLifecycle,
  DeviceIntegrity,
  DeviceSignalsReader,
  Platform,
  PushNotifications,
  SecureStorage,
} from '../types'
import { WebDeviceHealthInspector } from './device-health'
import { DexieOfflineDb } from './offline-db'
import { WebLocationTracker } from './location-tracker'

/** Browser / PWA implementation: foreground-only tracking, IndexedDB queue, no secrets in JS. */
export function createWebPlatform(): Platform {
  const app = new WebAppLifecycle()
  const offlineDb = new DexieOfflineDb()
  return {
    kind: 'pwa',
    location: new WebLocationTracker(offlineDb),
    secureStorage: new MemorySecureStorage(),
    offlineDb,
    push: new WebPush(),
    integrity: new NoIntegrity(),
    deviceHealth: new WebDeviceHealthInspector(),
    signals: new WebDeviceSignals(),
    app,
  }
}

/** Browsers expose none of these settings; every signal is "unknown". */
class WebDeviceSignals implements DeviceSignalsReader {
  async read() {
    return unknownSignals('web')
  }
}

/**
 * The web client keeps no long-lived secrets: the refresh token is an httpOnly
 * cookie the page cannot read. This only holds values for the current tab.
 */
class MemorySecureStorage implements SecureStorage {
  private readonly values = new Map<string, string>()
  async get(key: string) {
    return this.values.get(key) ?? null
  }
  async set(key: string, value: string) {
    this.values.set(key, value)
  }
  async remove(key: string) {
    this.values.delete(key)
  }
}

/** No push on the web yet. */
class WebPush implements PushNotifications {
  // TODO: Web Push (VAPID) for installed PWAs once supervisors need to reach iPhone reps.
  async permission() {
    return 'notRequired' as const
  }
  async requestPermission() {
    return 'notRequired' as const
  }
  async register() {
    return null
  }
  onData() {
    return () => {}
  }
}

class NoIntegrity implements DeviceIntegrity {
  async getToken() {
    return null
  }
}

const DEVICE_ID_KEY = 'op.deviceId'

class WebAppLifecycle implements AppLifecycle {
  async info(): Promise<AppInfo> {
    const ua = navigator.userAgent
    const isIos = /iPhone|iPad|iPod/i.test(ua)
    const isAndroid = /Android/i.test(ua)
    return {
      platform: isIos ? 'ios' : isAndroid ? 'android' : 'web',
      isNative: false,
      isStandalone:
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
      appVersion: __APP_VERSION__,
      manufacturer: isIos ? 'Apple' : null,
      model: null,
      osVersion: null,
      androidSdk: null,
      deviceId: deviceId(),
    }
  }

  onResume(handler: () => void) {
    const listener = () => {
      if (document.visibilityState === 'visible') handler()
    }
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  }
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = `web-${crypto.randomUUID()}`
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'web-ephemeral'
  }
}
