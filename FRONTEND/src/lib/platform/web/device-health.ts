import type { DeviceHealthInspector, DeviceHealthState, LocationPermission } from '../types'

/**
 * Browser checks. Only the location permission and whether a fix can be
 * obtained are knowable; background tracking, battery settings and mock
 * providers are not exposed to web pages.
 */
export class WebDeviceHealthInspector implements DeviceHealthInspector {
  private locationServicesEnabled = true

  async inspect(): Promise<DeviceHealthState> {
    return {
      locationPermission: await this.locationPermission(),
      preciseLocation: true,
      notificationPermission: 'notRequired',
      locationServicesEnabled: this.locationServicesEnabled,
      batteryOptimizationIgnored: null,
      mockLocationDetected: false,
      developerOptionsEnabled: null,
      powerSaveMode: null,
    }
  }

  /** Asking for a fix is what makes the browser show its permission prompt. */
  requestLocationWhileInUse(): Promise<LocationPermission> {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          this.locationServicesEnabled = true
          resolve('whileInUse')
        },
        (error) => {
          if (error.code === error.POSITION_UNAVAILABLE) this.locationServicesEnabled = false
          resolve(error.code === error.PERMISSION_DENIED ? 'none' : 'whileInUse')
        },
        { timeout: 20_000 },
      )
    })
  }

  /** Browsers have no "always" permission. */
  requestLocationAlways(): Promise<LocationPermission> {
    return this.locationPermission()
  }

  async requestPreciseLocation(): Promise<boolean> {
    return true
  }

  async openAppSettings(): Promise<void> {}
  async openLocationSettings(): Promise<void> {}
  async openNotificationSettings(): Promise<void> {}
  async requestIgnoreBatteryOptimizations(): Promise<void> {}
  async openOemPowerSettings(): Promise<boolean> {
    return false
  }
  async openDeveloperOptions(): Promise<void> {}

  async checkMockLocation(): Promise<boolean | null> {
    return null
  }

  private async locationPermission(): Promise<LocationPermission> {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' })
      return status.state === 'granted' ? 'whileInUse' : 'none'
    } catch {
      return 'none'
    }
  }
}
