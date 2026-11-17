import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import auth from './slices/authSlice'
import liveLocations from './slices/liveLocationsSlice'
import permissions from './slices/permissionsSlice'
import tracking from './slices/trackingSlice'
import ui from './slices/uiSlice'

/**
 * Client state only (session, permissions, UI, live map, device tracking state).
 * Server data lives in TanStack Query.
 */
export const store = configureStore({
  reducer: { auth, permissions, ui, liveLocations, tracking },
})

export type AppStore = typeof store
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
