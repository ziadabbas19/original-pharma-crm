import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ShiftDto, TrackingConfigDto } from '@/api/generated/model'
import { IDLE_MOCK_WATCH, type MockWatchState } from '@/features/integrity/mock-watch'
import type { DeviceHealthState, DeviceSignals } from '@/lib/platform/types'
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
  /** A fake (mock) location is on: tracking is not trusted until a real fix arrives. */
  mockWatch: MockWatchState
  /** Latest device signals (developer options, spoofing apps, ...), sent with uploads and visits. */
  deviceSignals: DeviceSignals | null
}

const ONBOARDING_KEY = 'op.onboarding.completedAt'
const SHIFT_KEY = 'op.shift.current'

function readCompletedAt(): string | null {
  try {
    return localStorage.getItem(ONBOARDING_KEY)
  } catch {
    return null
  }
}

/** The last shift the server reported, so a rep without a connection still knows their day is running. */
function readShift(): ShiftDto | null {
  try {
    const raw = localStorage.getItem(SHIFT_KEY)
    return raw ? (JSON.parse(raw) as ShiftDto) : null
  } catch {
    return null
  }
}

function writeShift(shift: ShiftDto | null) {
  try {
    if (shift) localStorage.setItem(SHIFT_KEY, JSON.stringify(shift))
    else localStorage.removeItem(SHIFT_KEY)
  } catch {
    // storage unavailable (private mode); state still holds it for this session
  }
}

const initialState: TrackingState = {
  shift: readShift(),
  config: null,
  trackingRunning: false,
  health: null,
  healthIssues: [],
  healthCheckedAt: null,
  onboarding: { statuses: {}, completedAt: readCompletedAt() },
  mockWatch: IDLE_MOCK_WATCH,
  deviceSignals: null,
}

const trackingSlice = createSlice({
  name: 'tracking',
  initialState,
  reducers: {
    shiftChanged(state, action: PayloadAction<ShiftDto | null>) {
      state.shift = action.payload
      writeShift(action.payload)
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
    mockWatchChanged(state, action: PayloadAction<MockWatchState>) {
      state.mockWatch = action.payload
    },
    deviceSignalsRead(state, action: PayloadAction<DeviceSignals>) {
      state.deviceSignals = action.payload
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
      writeShift(null)
      state.config = null
      state.trackingRunning = false
      state.mockWatch = IDLE_MOCK_WATCH
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
  mockWatchChanged,
  deviceSignalsRead,
} = trackingSlice.actions
export default trackingSlice.reducer
