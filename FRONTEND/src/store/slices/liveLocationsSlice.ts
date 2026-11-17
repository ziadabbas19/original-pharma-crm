import { createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { LivePositionDto, PresenceStatus, RepPresenceDto } from '@/api/generated/model'
import type { DeviceHealthChangeDto, PresenceChangeDto } from '@/features/tracking/hub-events'
import { sessionEnded } from './authSlice'

/** One rep on the live map. Seeded from the presence query, then patched by SignalR events. */
export interface LiveRep {
  userId: string
  fullName: string
  status: PresenceStatus
  lastSeenAt: string | null
  position: LivePositionDto | null
  deviceHealthy: boolean
  healthIssues: string[]
  openFlags: number
}

/** ISO timestamps from the API vary in fractional digits, so compare instants rather than strings. */
function isNewer(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime()
}

const adapter = createEntityAdapter<LiveRep, string>({
  selectId: (rep) => rep.userId,
  sortComparer: (a, b) => a.fullName.localeCompare(b.fullName),
})

const liveLocationsSlice = createSlice({
  name: 'liveLocations',
  initialState: adapter.getInitialState({ connected: false, watchedRepId: null as string | null }),
  reducers: {
    presenceLoaded(state, action: PayloadAction<RepPresenceDto[]>) {
      adapter.setAll(
        state,
        action.payload.map((p) => {
          // A SignalR position may have arrived after the snapshot was read: keep the newer one.
          const existing = state.entities[p.userId]
          const keepLive =
            existing?.position != null &&
            p.position != null &&
            isNewer(existing.position.recordedAt, p.position.recordedAt)
          return {
            userId: p.userId,
            fullName: p.fullName,
            status: p.status,
            lastSeenAt: keepLive ? existing.lastSeenAt : p.lastSeenAt,
            position: keepLive ? existing.position : p.position,
            deviceHealthy: p.deviceHealthy,
            healthIssues: p.healthIssues,
            openFlags: p.openFlags,
          }
        }),
      )
    },
    positionUpdated(state, action: PayloadAction<LivePositionDto>) {
      const p = action.payload
      const existing = state.entities[p.userId]
      // Ignore out-of-order deliveries.
      if (existing?.position && isNewer(existing.position.recordedAt, p.recordedAt)) return
      adapter.upsertOne(state, {
        userId: p.userId,
        fullName: existing?.fullName ?? p.userId,
        status: 'online',
        lastSeenAt: p.receivedAt,
        position: p,
        deviceHealthy: existing?.deviceHealthy ?? true,
        healthIssues: existing?.healthIssues ?? [],
        openFlags: existing?.openFlags ?? 0,
      })
    },
    presenceChanged(state, action: PayloadAction<PresenceChangeDto>) {
      adapter.updateOne(state, { id: action.payload.userId, changes: { status: action.payload.status } })
    },
    deviceHealthChanged(state, action: PayloadAction<DeviceHealthChangeDto>) {
      adapter.updateOne(state, {
        id: action.payload.userId,
        changes: { deviceHealthy: action.payload.isHealthy, healthIssues: action.payload.issues },
      })
    },
    flagRaised(state, action: PayloadAction<{ userId: string }>) {
      const rep = state.entities[action.payload.userId]
      if (rep) rep.openFlags += 1
    },
    hubConnectionChanged(state, action: PayloadAction<boolean>) {
      state.connected = action.payload
    },
    repWatched(state, action: PayloadAction<string | null>) {
      state.watchedRepId = action.payload
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sessionEnded, () => adapter.getInitialState({ connected: false, watchedRepId: null }))
  },
})

export const {
  presenceLoaded,
  positionUpdated,
  presenceChanged,
  deviceHealthChanged,
  flagRaised,
  hubConnectionChanged,
  repWatched,
} = liveLocationsSlice.actions

export const liveLocationsSelectors = adapter.getSelectors()
export default liveLocationsSlice.reducer
