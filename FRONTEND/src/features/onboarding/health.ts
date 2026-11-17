import { trackingReportDeviceHealth } from '@/api/generated/endpoints'
import type { HealthReportTrigger } from '@/api/generated/model'
import { platform, type AppInfo, type DeviceHealthState, type PlatformKind } from '@/lib/platform'

/** Issue codes; same rules and codes as BACKEND Application/Tracking/DeviceHealthEvaluator.cs. */
export const HealthIssue = {
  locationPermissionMissing: 'location-permission-missing',
  backgroundLocationMissing: 'background-location-missing',
  approximateLocation: 'approximate-location',
  notificationsDenied: 'notifications-denied',
  batteryOptimizationOn: 'battery-optimization-on',
  locationServicesOff: 'location-services-off',
  mockLocation: 'mock-location',
} as const

export type HealthIssueCode = (typeof HealthIssue)[keyof typeof HealthIssue]

export function evaluateHealth(h: DeviceHealthState, kind: PlatformKind): HealthIssueCode[] {
  const issues: HealthIssueCode[] = []
  if (h.locationPermission === 'none') issues.push(HealthIssue.locationPermissionMissing)
  else if (kind === 'native' && h.locationPermission !== 'always')
    issues.push(HealthIssue.backgroundLocationMissing)
  if (h.locationPermission !== 'none' && !h.preciseLocation) issues.push(HealthIssue.approximateLocation)
  if (!h.locationServicesEnabled) issues.push(HealthIssue.locationServicesOff)
  if (h.mockLocationDetected) issues.push(HealthIssue.mockLocation)
  if (kind === 'native') {
    if (h.notificationPermission === 'denied' || h.notificationPermission === 'prompt')
      issues.push(HealthIssue.notificationsDenied)
    if (h.batteryOptimizationIgnored === false) issues.push(HealthIssue.batteryOptimizationOn)
  }
  return issues
}

/** Which wizard step fixes each issue (used by the "Fix" buttons). */
export const STEP_FOR_ISSUE: Record<HealthIssueCode, string> = {
  'location-permission-missing': 'locationWhileInUse',
  'background-location-missing': 'locationAlways',
  'approximate-location': 'locationAlways',
  'notifications-denied': 'notifications',
  'battery-optimization-on': 'battery',
  'location-services-off': 'locationServices',
  'mock-location': 'mockLocation',
}

export type OemBrand = 'samsung' | 'xiaomi' | 'oppo' | 'huawei' | 'vivo' | 'generic'

/** Picks the battery guide from the manufacturer string Android reports. */
export function detectOem(manufacturer: string | null | undefined): OemBrand {
  const m = (manufacturer ?? '').toLowerCase()
  if (m.includes('samsung')) return 'samsung'
  if (/xiaomi|redmi|poco/.test(m)) return 'xiaomi'
  if (/oppo|realme|oneplus/.test(m)) return 'oppo'
  if (/huawei|honor/.test(m)) return 'huawei'
  if (/vivo|iqoo/.test(m)) return 'vivo'
  return 'generic'
}

let pushToken: string | null | undefined

/** Sends the device's tracking readiness to the server (supervisors see "unhealthy tracking"). */
export async function reportHealth(
  health: DeviceHealthState,
  info: AppInfo,
  trigger: HealthReportTrigger,
  onboardingCompleted = false,
) {
  const p = platform()
  if (pushToken === undefined && health.notificationPermission === 'granted') {
    pushToken = await p.push.register().catch(() => null)
  }

  return trackingReportDeviceHealth({
    deviceId: info.deviceId,
    source: p.kind === 'native' ? 'native' : 'pwa',
    platform: info.platform,
    trigger,
    locationPermission: health.locationPermission,
    preciseLocation: health.preciseLocation,
    notificationPermission: health.notificationPermission,
    locationServicesEnabled: health.locationServicesEnabled,
    mockLocationDetected: health.mockLocationDetected,
    batteryOptimizationIgnored: health.batteryOptimizationIgnored,
    developerOptionsEnabled: health.developerOptionsEnabled,
    powerSaveMode: health.powerSaveMode,
    appVersion: info.appVersion,
    manufacturer: info.manufacturer,
    model: info.model,
    osVersion: info.osVersion,
    pushToken: pushToken ?? null,
    onboardingCompleted,
  })
}
