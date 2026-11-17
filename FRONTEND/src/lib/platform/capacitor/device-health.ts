import { AndroidSettings, NativeSettings } from 'capacitor-native-settings'
import BackgroundGeolocation from '@transistorsoft/capacitor-background-geolocation'
import type {
  DeviceHealthInspector,
  DeviceHealthState,
  LocationPermission,
  PushNotifications,
} from '../types'
import { nativeSignals, type CapacitorLocationTracker } from './location-tracker'

/** Android checks backed by the background geolocation SDK and system settings deep links. */
export class CapacitorDeviceHealthInspector implements DeviceHealthInspector {
  constructor(
    private readonly tracker: CapacitorLocationTracker,
    private readonly push: PushNotifications,
  ) {}

  async inspect(): Promise<DeviceHealthState> {
    await this.tracker.ensureReady()
    const provider = await BackgroundGeolocation.getProviderState()
    const [notificationPermission, batteryOptimizationIgnored, powerSaveMode] = await Promise.all([
      this.push.permission(),
      BackgroundGeolocation.deviceSettings.isIgnoringBatteryOptimizations().catch(() => null),
      BackgroundGeolocation.isPowerSaveMode().catch(() => null),
    ])

    return {
      locationPermission: toPermission(provider.status),
      preciseLocation: provider.accuracyAuthorization === BackgroundGeolocation.AccuracyAuthorization.Full,
      notificationPermission,
      locationServicesEnabled: provider.enabled,
      batteryOptimizationIgnored,
      mockLocationDetected: nativeSignals.lastMockSeen,
      // TODO: small native check of Settings.Global.DEVELOPMENT_SETTINGS_ENABLED.
      developerOptionsEnabled: null,
      powerSaveMode,
    }
  }

  async requestLocationWhileInUse(): Promise<LocationPermission> {
    await this.tracker.ensureReady()
    await BackgroundGeolocation.setConfig({ geolocation: { locationAuthorizationRequest: 'WhenInUse' } })
    try {
      return toPermission(await BackgroundGeolocation.requestPermission())
    } catch {
      return toPermission((await BackgroundGeolocation.getProviderState()).status)
    } finally {
      await BackgroundGeolocation.setConfig({ geolocation: { locationAuthorizationRequest: 'Always' } })
    }
  }

  /**
   * Android 10 shows "Allow all the time" in the dialog; Android 11+ only offers it
   * in the app's location settings. The SDK shows our rationale and opens that screen.
   */
  async requestLocationAlways(): Promise<LocationPermission> {
    await this.tracker.ensureReady()
    await BackgroundGeolocation.setConfig({ geolocation: { locationAuthorizationRequest: 'Always' } })
    try {
      return toPermission(await BackgroundGeolocation.requestPermission())
    } catch {
      return toPermission((await BackgroundGeolocation.getProviderState()).status)
    }
  }

  /** Asking again lets Android 12+ users switch "Approximate" to "Precise". */
  async requestPreciseLocation(): Promise<boolean> {
    await this.tracker.ensureReady()
    await BackgroundGeolocation.requestPermission().catch(() => undefined)
    const provider = await BackgroundGeolocation.getProviderState()
    return provider.accuracyAuthorization === BackgroundGeolocation.AccuracyAuthorization.Full
  }

  async openAppSettings(): Promise<void> {
    await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDetails })
  }

  async openLocationSettings(): Promise<void> {
    await NativeSettings.openAndroid({ option: AndroidSettings.Location })
  }

  async openNotificationSettings(): Promise<void> {
    await NativeSettings.openAndroid({ option: AndroidSettings.AppNotification })
  }

  async requestIgnoreBatteryOptimizations(): Promise<void> {
    await this.tracker.ensureReady()
    try {
      const request = await BackgroundGeolocation.deviceSettings.showIgnoreBatteryOptimizations()
      await BackgroundGeolocation.deviceSettings.show(request)
    } catch {
      await NativeSettings.openAndroid({ option: AndroidSettings.BatteryOptimization })
    }
  }

  async openOemPowerSettings(): Promise<boolean> {
    await this.tracker.ensureReady()
    try {
      const request = await BackgroundGeolocation.deviceSettings.showPowerManager()
      return await BackgroundGeolocation.deviceSettings.show(request)
    } catch {
      return false
    }
  }

  async openDeveloperOptions(): Promise<void> {
    await NativeSettings.openAndroid({ option: AndroidSettings.ApplicationDevelopment })
  }

  async checkMockLocation(): Promise<boolean | null> {
    try {
      const fix = await this.tracker.getCurrentPosition({ timeoutMs: 30_000 })
      return fix.isMock
    } catch {
      return null
    }
  }
}

function toPermission(status: number): LocationPermission {
  const s = BackgroundGeolocation.AuthorizationStatus
  if (status === s.Always) return 'always'
  if (status === s.WhenInUse) return 'whileInUse'
  return 'none'
}
