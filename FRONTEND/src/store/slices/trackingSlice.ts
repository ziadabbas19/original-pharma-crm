import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ShiftDto, TrackingConfigDto } from '@/api/generated/model'
import type { DeviceHealthState } from '@/lib/platform/types'
import { sessionEnded } from './authSlice'

export type CheckStatus = 'done' | 'pending' | 'problem' | 'notApplicable'

export interface TrackingState {
  /** Current shift as known by the server. */
  shift: ShiftDto | null
  config: TrackingConfigDto | null
  trackingRunning: boolean
  /** Latest local device inspection and the issues derived from it. */
  health: DeviceHealthState | null
  healthIssues: string[]
  healthCheckedAt: string | null
  /** Setup wizard progress for this device. */
  onboarding: {
    statuses: Record<string, CheckStatus>
    completedAt: string | null
  }
}

const ONBOARDING_KEY = 'op.onboarding.completedAt'

function readCompletedAt(): string | null {
  try {
    return localStorage.getItem(ONBOARDING_KEY)
  } catch {
    return null
  }
}

const initialState: TrackingState = {
  shift: null,
  config: null,
  trackingRunning: false,
  health: null,
  healthIssues: [],
  healthCheckedAt: null,
  onboarding: { statuses: {}, completedAt: readCompletedAt() },
}

const trackingSlice = createSlice({
  name: 'tracking',
  initialState,
  reducers: {
    shiftChanged(state, action: PayloadAction<ShiftDto | null>) {
      state.shift = action.payload
    },
    configChanged(state, action: PayloadAction<TrackingConfigDto | null>) {
      state.config = action.payload
    },
    trackingRunningChanged(state, action: PayloadAction<boolean>) {
      state.trackingRunning = action.payload
    },
    healthInspected(state, action: PayloadAction<{ health: DeviceHealthState; issues: string[] }>) {
      state.health = action.payload.health
      state.healthIssues = action.payload.issues
      state.healthCheckedAt = new Date().toISOString()
    },
    onboardingStepChecked(state, action: PayloadAction<{ stepId: string; status: CheckStatus }>) {
      state.onboarding.statuses[action.payload.stepId] = action.payload.status
    },
    onboardingCompleted(state, action: PayloadAction<string>) {
      state.onboarding.completedAt = action.payload
      try {
        localStorage.setItem(ONBOARDING_KEY, action.payload)
      } catch {
        // storage unavailable (private mode); state still holds it for this session
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sessionEnded, (state) => {
      state.shift = null
      state.config = null
      state.trackingRunning = false
    })
  },
})

export const {
  shiftChanged,
  configChanged,
  trackingRunningChanged,
  healthInspected,
  onboardingStepChecked,
  onboardingCompleted,
} = trackingSlice.actions
export default trackingSlice.reducer
