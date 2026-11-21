import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type Language = 'ar' | 'en'

export interface UiState {
  language: Language
  /** Desktop sidebar shows icons only (remembered on the device). */
  sidebarCollapsed: boolean
}

const COLLAPSED_KEY = 'op.sidebarCollapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const initialState: UiState = {
  language: 'ar',
  sidebarCollapsed: readCollapsed(),
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    languageChanged(state, action: PayloadAction<Language>) {
      state.language = action.payload
    },
    sidebarCollapsedToggled(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed
      try {
        localStorage.setItem(COLLAPSED_KEY, state.sidebarCollapsed ? '1' : '0')
      } catch {
        // Not remembered in private mode.
      }
    },
  },
})

export const { languageChanged, sidebarCollapsedToggled } = uiSlice.actions
export default uiSlice.reducer
