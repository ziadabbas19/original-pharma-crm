import type { DeviceHealthState, PlatformKind } from '@/lib/platform'
import type { CheckStatus } from '@/store/slices/trackingSlice'

export const STEP_IDS = [
  'consent',
  'locationWhileInUse',
  'locationAlways',
  'notifications',
  'locationServices',
  'battery',
  'mockLocation',
  'healthCheck',
] as const

export type StepId = (typeof STEP_IDS)[number]

export function isStepId(value: unknown): value is StepId {
  return typeof value === 'string' && (STEP_IDS as readonly string[]).includes(value)
}

export interface StepContext {
  kind: PlatformKind
  health: DeviceHealthState | null
  androidSdk: number | null
  consentAccepted: boolean | undefined
  /** Result of the explicit mock check in step 7 (undefined = not run yet). */
  mockCheck: boolean | null | undefined
  /** Result of the final check in step 8 (undefined = not run yet). */
  finalCheckPassed: boolean | undefined
}

/** done / pending / problem / notApplicable for one wizard step. */
export function stepStatus(id: StepId, ctx: StepContext): CheckStatus {
  const { kind, health } = ctx
  const native = kind === 'native'

  switch (id) {
    case 'consent':
      return ctx.consentAccepted ? 'done' : 'pending'
    case 'locationWhileInUse':
      if (!health) return 'pending'
      return health.locationPermission !== 'none' ? 'done' : 'pending'
    case 'locationAlways':
      if (!native) return 'notApplicable'
      if (!health) return 'pending'
      if (health.locationPermission === 'always' && health.preciseLocation) return 'done'
      return health.locationPermission === 'none' ? 'pending' : 'problem'
    case 'notifications':
      if (!native) return 'notApplicable'
      if (!health) return 'pending'
      if (health.notificationPermission === 'granted' || health.notificationPermission === 'notRequired')
        return 'done'
      return health.notificationPermission === 'denied' ? 'problem' : 'pending'
    case 'locationServices':
      if (!health) return 'pending'
      return health.locationServicesEnabled ? 'done' : 'problem'
    case 'battery':
      if (!native) return 'notApplicable'
      if (!health) return 'pending'
      // null: the device does not expose the setting; only the OEM guide applies.
      if (health.batteryOptimizationIgnored === null) return 'notApplicable'
      return health.batteryOptimizationIgnored ? 'done' : 'pending'
    case 'mockLocation':
      if (!native) return 'notApplicable'
      if (ctx.mockCheck === true || health?.mockLocationDetected) return 'problem'
      return ctx.mockCheck === false ? 'done' : 'pending'
    case 'healthCheck':
      if (ctx.finalCheckPassed === undefined) return 'pending'
      return ctx.finalCheckPassed ? 'done' : 'problem'
  }
}

/** Every applicable step before the final check is done. */
export function readyForFinalCheck(ctx: StepContext): boolean {
  return STEP_IDS.filter((id) => id !== 'healthCheck').every((id) => {
    const s = stepStatus(id, ctx)
    return s === 'done' || s === 'notApplicable'
  })
}
