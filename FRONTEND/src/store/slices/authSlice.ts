import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { UserProfileDto } from '@/api/generated/model'

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

export interface AuthState {
  status: AuthStatus
  /** Kept in memory only. The refresh token lives in an httpOnly cookie (web) or secure storage (native). */
  accessToken: string | null
  expiresAt: string | null
  user: UserProfileDto | null
  /** Highest order-line discount the user may give (from their roles); null = no cap. */
  maxDiscountPercent: number | null
}

const initialState: AuthState = {
  status: 'unknown',
  accessToken: null,
  expiresAt: null,
  user: null,
  maxDiscountPercent: null,
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
    discountCapLoaded(state, action: PayloadAction<number | null>) {
      state.maxDiscountPercent = action.payload
    },
    /** Started without network from the cached profile; the access token comes with the first refresh. */
    offlineSessionRestored(state, action: PayloadAction<UserProfileDto>) {
      state.status = 'authenticated'
      state.accessToken = null
      state.expiresAt = null
      state.user = action.payload
    },
    sessionEnded() {
      return { ...initialState, status: 'anonymous' as const }
    },
  },
})

export const { sessionStarted, userLoaded, discountCapLoaded, offlineSessionRestored, sessionEnded } =
  authSlice.actions
export default authSlice.reducer
