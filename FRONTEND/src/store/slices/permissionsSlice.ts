import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { PermissionGrantDto, PermissionScope } from '@/api/generated/model'
import { sessionEnded } from './authSlice'

export interface PermissionsState {
  /** Version the current grants were loaded at; -1 = not loaded. */
  version: number
  /** Latest version the server reported in X-Permissions-Version. */
  serverVersion: number
  byKey: Record<string, PermissionScope>
}

const initialState: PermissionsState = { version: -1, serverVersion: -1, byKey: {} }

const permissionsSlice = createSlice({
  name: 'permissions',
  initialState,
  reducers: {
    permissionsLoaded(state, action: PayloadAction<{ version: number; grants: PermissionGrantDto[] }>) {
      state.version = action.payload.version
      state.serverVersion = Math.max(state.serverVersion, action.payload.version)
      state.byKey = Object.fromEntries(action.payload.grants.map((g) => [g.key, g.scope]))
    },
    serverVersionSeen(state, action: PayloadAction<number>) {
      state.serverVersion = action.payload
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sessionEnded, () => initialState)
  },
})

export const { permissionsLoaded, serverVersionSeen } = permissionsSlice.actions
export default permissionsSlice.reducer
