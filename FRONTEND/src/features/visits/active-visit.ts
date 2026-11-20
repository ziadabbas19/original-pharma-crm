import { useEffect, useState } from 'react'
import { visitsGet, visitsList } from '@/api/generated/endpoints'
import type { VisitFeedbackCategory } from '@/api/generated/model'
import { currentDeviceSignals } from '@/features/integrity/device-signals-sync'
import { newClientRequestId } from '@/features/orders/order-math'
import { platform, type GeoFix } from '@/lib/platform'
import { store } from '@/store'
import {
  enqueueVisitSteps,
  onCheckInRefused,
  readVisitOutbox,
  storeVisitContent,
  syncVisits,
} from './visit-outbox'
import type { VisitCustomerRef } from './visit-queue'

/**
 * The visit in progress on this device. It is written to the device database on every change, so it
 * comes back after the app is killed and works with no connection at all.
 */

const KIND = 'visit-active'
const DAY_MS = 86_400_000

export interface DraftProduct {
  productId: string
  nameAr: string
  nameEn: string
  thumbnailUrl?: string | null
  note: string
}

export interface VisitDraft {
  text: string
  category: NonNullable<VisitFeedbackCategory> | null
  products: DraftProduct[]
}

export const EMPTY_DRAFT: VisitDraft = { text: '', category: null, products: [] }

export interface ActiveVisit {
  visitId: string
  userId: string
  customer: VisitCustomerRef
  checkInAt: string
  accuracy: number
  distance: number
  inside: boolean
  isMock: boolean
  draft: VisitDraft
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const currentUserId = () => store.getState().auth.user?.id

export async function loadActiveVisit(): Promise<ActiveVisit | null> {
  const userId = currentUserId()
  if (!userId) return null
  const rows = await platform().offlineDb.peek<ActiveVisit>(KIND, 50)
  return rows.find((r) => r.payload.userId === userId)?.payload ?? null
}

async function replaceActiveVisit(next: ActiveVisit | null): Promise<void> {
  const userId = currentUserId()
  const db = platform().offlineDb
  const rows = await db.peek<ActiveVisit>(KIND, 50)
  const mine = rows.filter((r) => r.payload.userId === userId).map((r) => r.id)
  if (mine.length > 0) await db.remove(mine)
  if (next) await db.enqueue(KIND, next)
  notify()
}

export const saveActiveVisit = (visit: ActiveVisit) => replaceActiveVisit(visit)

export interface StartVisitInput {
  customer: VisitCustomerRef
  fix: GeoFix
  distance: number
  inside: boolean
  /** Compressed proof photo (data URL). */
  photo?: string | null
}

/** Opens the visit on the device at once; the check-in reaches the server as soon as it can. */
export async function startVisit(input: StartVisitInput): Promise<ActiveVisit> {
  if (await loadActiveVisit()) throw new Error('A visit is already in progress')
  const userId = currentUserId()
  if (!userId) throw new Error('Not signed in')

  const { customer, fix, distance, inside, photo } = input
  const visitId = newClientRequestId()
  const { deviceId } = await platform().app.info()
  const health = await platform()
    .deviceHealth.inspect()
    .catch(() => null)
  const isMock = fix.isMock || health?.mockLocationDetected === true

  const visit: ActiveVisit = {
    visitId,
    userId,
    customer,
    checkInAt: fix.timestamp,
    accuracy: fix.accuracy,
    distance,
    inside,
    isMock,
    draft: EMPTY_DRAFT,
  }
  await enqueueVisitSteps([
    {
      type: 'checkIn',
      visitId,
      customer,
      inside,
      distance,
      request: {
        clientRequestId: visitId,
        customerId: customer.id,
        deviceId,
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        timestamp: fix.timestamp,
        isMock,
        deviceSignals: currentDeviceSignals(),
      },
    },
    ...(photo ? [{ type: 'photo' as const, visitId, photoId: newClientRequestId(), dataUrl: photo }] : []),
  ])
  await replaceActiveVisit(visit)
  void syncVisits().catch(() => {})
  return visit
}

/** The draft as the API expects it. */
export function draftToContent(draft: VisitDraft) {
  return {
    feedback: draft.text.trim() ? { text: draft.text.trim(), category: draft.category } : null,
    products: draft.products.map((p) => ({ productId: p.productId, note: p.note.trim() || null })),
    clientUpdatedAt: new Date().toISOString(),
  }
}

const hasContent = (draft: VisitDraft) => draft.text.trim() !== '' || draft.products.length > 0

export interface CheckOutInput {
  fix: GeoFix | null
  notes?: string
}

/** Closes the visit on the device; the content and the check-out follow the check-in in the outbox. */
export async function checkOutVisit(visit: ActiveVisit, { fix, notes }: CheckOutInput): Promise<void> {
  if (hasContent(visit.draft)) {
    await storeVisitContent(visit.visitId, visit.customer.name, draftToContent(visit.draft))
  }
  await enqueueVisitSteps([
    {
      type: 'checkOut',
      visitId: visit.visitId,
      request: {
        clientRequestId: newClientRequestId(),
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        accuracy: fix?.accuracy ?? null,
        timestamp: new Date().toISOString(),
        isMock: fix?.isMock ?? false,
        notes: notes?.trim() || null,
        deviceSignals: currentDeviceSignals(),
      },
    },
  ])
  await replaceActiveVisit(null)
  void syncVisits().catch(() => {})
}

/**
 * Brings this device in line with the server: picks up a visit opened on another device or before a
 * reinstall, and lets go of one that was closed elsewhere. Does nothing without a connection.
 */
export async function reconcileActiveVisit(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  // Read before asking the server: a check-in sent in the meantime must not look like a closed visit.
  const [state, local] = await Promise.all([readVisitOutbox(), loadActiveVisit()])
  const now = Date.now()
  const open = await visitsList({
    mine: true,
    status: 'inProgress',
    from: new Date(now - 30 * DAY_MS).toISOString(),
    to: new Date(now + DAY_MS).toISOString(),
  })
  const unsent = (visitId: string, type: string) =>
    [...state.steps, ...state.failedSteps].some(
      (i) => i.payload.visitId === visitId && i.payload.type === type,
    )

  if (local) {
    const stillOpen = open.some((v) => v.id === local.visitId)
    if (!stillOpen && !unsent(local.visitId, 'checkIn')) await replaceActiveVisit(null)
    return
  }

  const server = open.find((v) => !unsent(v.id, 'checkOut'))
  const userId = currentUserId()
  if (!server || !userId) return
  const detail = await visitsGet(server.id)
  if (await loadActiveVisit()) return // the rep started a visit while this was loading
  await replaceActiveVisit({
    visitId: server.id,
    userId,
    customer: {
      id: server.customerId,
      name: server.customerName,
      nameAr: server.customerNameAr,
      type: server.customerType,
    },
    checkInAt: server.checkInAt,
    accuracy: server.checkInAccuracy,
    distance: server.checkInDistanceMeters,
    inside: server.checkInWithinGeofence,
    isMock: server.checkInIsMock,
    draft: {
      text: detail.feedback?.text ?? '',
      category: detail.feedback?.category ?? null,
      products: detail.products.map((p) => ({
        productId: p.productId,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        thumbnailUrl: p.thumbnailUrl,
        note: p.note ?? '',
      })),
    },
  })
}

/** A refused check-in leaves the visit list's "needs attention" entry; the notes written so far are kept. */
export function watchRefusedCheckIns(): () => void {
  return onCheckInRefused((step) => {
    void loadActiveVisit().then(async (visit) => {
      if (visit?.visitId !== step.visitId) return
      if (hasContent(visit.draft)) {
        await storeVisitContent(visit.visitId, visit.customer.name, draftToContent(visit.draft))
      }
      await replaceActiveVisit(null)
    })
  })
}

export interface ActiveVisitState {
  visit: ActiveVisit | null
  loaded: boolean
}

export function useActiveVisit(): ActiveVisitState {
  const [state, setState] = useState<ActiveVisitState>({ visit: null, loaded: false })
  useEffect(() => {
    let active = true
    const update = () =>
      void loadActiveVisit()
        .then((visit) => active && setState({ visit, loaded: true }))
        .catch(() => active && setState({ visit: null, loaded: true }))
    update()
    listeners.add(update)
    return () => {
      active = false
      listeners.delete(update)
    }
  }, [])
  return state
}
