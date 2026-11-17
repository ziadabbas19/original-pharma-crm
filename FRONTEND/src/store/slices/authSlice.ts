import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { UserProfileDto } from '@/api/generated/model'

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

export interface AuthState {
  status: AuthStatus
  /** Kept in memory only. The refresh token lives in an httpOnly cookie (web) or secure storage (native). */
  accessToken: string | null
  expiresAt: string | null
  user: UserProfileDto | null
}

const initialState: AuthState = {
  status: 'unknown',
  accessToken: null,
  expiresAt: null,
  user: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionStarted(
      state,
      action: PayloadAction<{ accessToken: string; expiresAt: string; user: UserProfileDto }>,
    ) {
      state.status = 'authenticated'
      state.accessToken = action.payload.accessToken
      state.expiresAt = action.payload.expiresAt
      state.user = action.payload.user
    },
    userLoaded(state, action: PayloadAction<UserProfileDto>) {
      state.user = action.payload
    },
    sessionEnded() {
      return { ...initialState, status: 'anonymous' as const }
    },
  },
})

export const { sessionStarted, userLoaded, sessionEnded } = authSlice.actions
export default authSlice.reducer
