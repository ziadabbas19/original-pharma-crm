/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DevicePlatform } from './devicePlatform'
import type { HealthReportTrigger } from './healthReportTrigger'
import type { LocationPermissionState } from './locationPermissionState'
import type { LocationSource } from './locationSource'
import type { NotificationPermissionState } from './notificationPermissionState'

export interface DeviceHealthReportRequest {
  deviceId: string
  source: LocationSource
  platform: DevicePlatform
  trigger: HealthReportTrigger
  locationPermission: LocationPermissionState
  preciseLocation: boolean
  notificationPermission: NotificationPermissionState
  locationServicesEnabled: boolean
  mockLocationDetected: boolean
  /** @nullable */
  batteryOptimizationIgnored?: boolean | null
  /** @nullable */
  developerOptionsEnabled?: boolean | null
  /** @nullable */
  powerSaveMode?: boolean | null
  /** @nullable */
  appVersion?: string | null
  /** @nullable */
  manufacturer?: string | null
  /** @nullable */
  model?: string | null
  /** @nullable */
  osVersion?: string | null
  /** @nullable */
  pushToken?: string | null
  onboardingCompleted?: boolean
}
