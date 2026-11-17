import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type Language = 'ar' | 'en'

export interface UiState {
  language: Language
  sidebarOpen: boolean
}

const initialState: UiState = {
  language: 'ar',
  sidebarOpen: false,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    languageChanged(state, action: PayloadAction<Language>) {
      state.language = action.payload
    },
    sidebarToggled(state, action: PayloadAction<boolean | undefined>) {
      state.sidebarOpen = action.payload ?? !state.sidebarOpen
    },
  },
})

export const { languageChanged, sidebarToggled } = uiSlice.actions
export default uiSlice.reducer
