/**
 * Original Pharma CRM API v1.
 * Do not edit by hand; re-run `npm run api:generate` after backend API changes.
 */
import type { DevicePlatform } from './devicePlatform'
import type { LocationPermissionState } from './locationPermissionState'
import type { LocationSource } from './locationSource'
import type { NotificationPermissionState } from './notificationPermissionState'

export interface DeviceDto {
  id: string
  userId: string
  userName: string
  deviceId: string
  platform: DevicePlatform
  source: LocationSource
  isHealthy: boolean
  issues: string[]
  locationPermission: LocationPermissionState
  preciseLocation: boolean
  notificationPermission: NotificationPermissionState
  /** @nullable */
  batteryOptimizationIgnored: boolean | null
  locationServicesEnabled: boolean
  mockLocationDetected: boolean
  /** @nullable */
  developerOptionsEnabled: boolean | null
  /** @nullable */
  powerSaveMode: boolean | null
  /** @nullable */
  appVersion: string | null
  /** @nullable */
  manufacturer: string | null
  /** @nullable */
  model: string | null
  /** @nullable */
  osVersion: string | null
  /** @nullable */
  onboardingCompletedAt: string | null
  firstSeenAt: string
  lastReportedAt: string
  openFlags: number
}
