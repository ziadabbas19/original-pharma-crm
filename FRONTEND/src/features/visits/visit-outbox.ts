import { useEffect, useState } from 'react'
import {
  getVisitsGetQueryKey,
  visitsCheckIn,
  visitsCheckOut,
  visitsUpdateContent,
  visitsUploadPhoto,
} from '@/api/generated/endpoints'
import type { UpdateVisitContentRequest, VisitDetailDto } from '@/api/generated/model'
import { queryClient } from '@/app/query-client'
import { ApiError } from '@/lib/api-client'
import { invalidateApi } from '@/lib/invalidate-api'
import { platform, type QueuedItem } from '@/lib/platform'
import { store } from '@/store'
import {
  drainSteps,
  nextSeq,
  type CheckInStep,
  type CheckOutStep,
  type FailedStep,
  type PhotoStep,
  type StepFailure,
  type VisitStep,
} from './visit-queue'

/**
 * Everything the rep does in a visit goes through the device outbox, online or not: check-in, proof
 * photo, feedback and products, check-out. Each carries a client key, so a retry after a lost response
 * changes nothing on the server. Content is the whole feedback and product list with the device time of
 * the edit (clientUpdatedAt): the server ignores anything older than what it already applied.
 */

const STEPS = 'visit-step'
const STEPS_FAILED = 'visit-step-failed'
const PENDING = 'visit-content'
const FAILED = 'visit-content-failed'

export interface QueuedVisitContent {
  userId: string
  visitId: string
  /** Shown in the list while waiting. */
  customerName: string
  request: UpdateVisitContentRequest
  queuedAt: string
}

export interface FailedVisitContent extends QueuedVisitContent {
  error: { status: number; code: string; title?: string }
}

export interface VisitOutboxState {
  pending: QueuedItem<QueuedVisitContent>[]
  failed: QueuedItem<FailedVisitContent>[]
  steps: QueuedItem<VisitStep>[]
  failedSteps: QueuedItem<FailedStep>[]
  syncing: boolean
}

const EMPTY_STATE: VisitOutboxState = { pending: [], failed: [], steps: [], failedSteps: [], syncing: false }

const listeners = new Set<() => void>()
const refusedListeners = new Set<(step: VisitStep) => void>()
let syncing: Promise<void> | null = null

const notify = () => listeners.forEach((listener) => listener())
const currentUserId = () => store.getState().auth.user?.id

function requireUserId(): string {
  const userId = currentUserId()
  if (!userId) throw new Error('Not signed in')
  return userId
}

/** Tells the active visit when the server refused its check-in. */
export function onCheckInRefused(listener: (step: VisitStep) => void): () => void {
  refusedListeners.add(listener)
  return () => refusedListeners.delete(listener)
}

async function queuedSteps() {
  const db = platform().offlineDb
  const [pending, failed] = await Promise.all([
    db.peek<VisitStep>(STEPS, 500),
    db.peek<FailedStep>(STEPS_FAILED, 500),
  ])
  return { pending, failed }
}

type NewStep =
  | Omit<CheckInStep, 'seq' | 'userId' | 'queuedAt'>
  | Omit<PhotoStep, 'seq' | 'userId' | 'queuedAt'>
  | Omit<CheckOutStep, 'seq' | 'userId' | 'queuedAt'>

/** Stores steps on the device, in the order given, without sending them yet. */
export async function enqueueVisitSteps(steps: NewStep[]): Promise<void> {
  const userId = requireUserId()
  const db = platform().offlineDb
  const { pending, failed } = await queuedSteps()
  let seq = nextSeq(
    [...pending, ...failed].map((i) => i.payload),
    Date.now(),
  )
  for (const step of steps) {
    await db.enqueue(STEPS, { ...step, seq: seq++, userId, queuedAt: new Date().toISOString() })
  }
  notify()
}

/** Saves the content on the device (replacing an earlier unsent edit of the same visit) without sending it. */
export async function storeVisitContent(
  visitId: string,
  customerName: string,
  request: UpdateVisitContentRequest,
): Promise<void> {
  const userId = requireUserId()
  const db = platform().offlineDb
  const [pending, failed] = await Promise.all([
    db.peek<QueuedVisitContent>(PENDING, 200),
    db.peek<FailedVisitContent>(FAILED, 200),
  ])
  const older = [...pending, ...failed].filter((i) => i.payload.visitId === visitId).map((i) => i.id)
  if (older.length > 0) await db.remove(older)
  await db.enqueue(PENDING, { userId, visitId, customerName, request, queuedAt: new Date().toISOString() })
  notify()
}

/** Saves the content on the device and tries to send it. */
export async function queueVisitContent(
  visitId: string,
  customerName: string,
  request: UpdateVisitContentRequest,
): Promise<void> {
  await storeVisitContent(visitId, customerName, request)
  await syncVisits()
}

export async function discardVisitContent(id: number): Promise<void> {
  await platform().offlineDb.remove([id])
  notify()
}

/** Puts everything the server refused for a visit back in the queue, in its original order. */
export async function retryVisit(visitId: string): Promise<void> {
  const db = platform().offlineDb
  const [{ failed }, content] = await Promise.all([queuedSteps(), db.peek<FailedVisitContent>(FAILED, 200)])
  for (const item of failed.filter((i) => i.payload.visitId === visitId)) {
    const { error: _error, ...step } = item.payload
    await db.enqueue(STEPS, step)
    await db.remove([item.id])
  }
  for (const item of content.filter((i) => i.payload.visitId === visitId)) {
    const { error: _error, ...queued } = item.payload
    await db.enqueue(PENDING, queued)
    await db.remove([item.id])
  }
  notify()
  await syncVisits()
}

function failureOf(error: unknown): StepFailure | null {
  return error instanceof ApiError
    ? { status: error.status, code: error.code, title: error.problem.title }
    : null
}

function isPermanent(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 408, 429].includes(error.status)
  )
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const [header, body] = dataUrl.split(',')
  const type = /data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg'
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}

async function sendStep(step: VisitStep): Promise<unknown> {
  switch (step.type) {
    case 'checkIn':
      return visitsCheckIn(step.request)
    case 'checkOut':
      return visitsCheckOut(step.visitId, step.request)
    case 'photo':
      return visitsUploadPhoto(
        step.visitId,
        { photo: await dataUrlToBlob(step.dataUrl) },
        { clientRequestId: step.photoId },
      )
  }
}

/** Sends queued content, oldest first. False when the server could not be reached. */
async function sendContent(
  userId: string,
  only: (visitId: string) => boolean,
  onSent?: () => void,
): Promise<boolean> {
  const db = platform().offlineDb
  const items = (await db.peek<QueuedVisitContent>(PENDING, 50)).filter(
    (i) => i.payload.userId === userId && only(i.payload.visitId),
  )
  for (const item of items) {
    try {
      const visit: VisitDetailDto = await visitsUpdateContent(item.payload.visitId, item.payload.request)
      await db.remove([item.id])
      queryClient.setQueryData(getVisitsGetQueryKey(item.payload.visitId), visit)
    } catch (error) {
      if (!isPermanent(error)) return false // offline or server trouble: keep the rest for later
      const failed: FailedVisitContent = {
        ...item.payload,
        error: { status: error.status, code: error.code, title: error.problem.title },
      }
      await db.enqueue(FAILED, failed)
      await db.remove([item.id])
    }
    onSent?.()
    notify()
  }
  return true
}

/** Sends everything queued by the signed-in user, in order. Single-flight. */
export function syncVisits(): Promise<void> {
  syncing ??= (async () => {
    const userId = currentUserId()
    if (!userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    notify()

    const db = platform().offlineDb
    const { pending, failed } = await queuedSteps()
    const mine = pending.filter((i) => i.payload.userId === userId)
    const held = new Set(failed.filter((i) => i.payload.userId === userId).map((i) => i.payload.visitId))
    const byStep = new Map(mine.map((item) => [item.payload, item.id]))
    let contentSent = 0
    const countContent = () => {
      contentSent++
    }

    const steps = await drainSteps(
      mine.map((i) => i.payload),
      held,
      {
        beforeCheckOut: (step) => sendContent(userId, (visitId) => visitId === step.visitId, countContent),
        send: sendStep,
        sent: async (step) => {
          await db.remove([byStep.get(step) as number])
          notify()
        },
        refused: async (step, failure) => {
          await db.enqueue(STEPS_FAILED, { ...step, error: failure })
          await db.remove([byStep.get(step) as number])
          held.add(step.visitId)
          if (step.type === 'checkIn') refusedListeners.forEach((listener) => listener(step))
          notify()
        },
        failureOf,
      },
    )

    // A visit whose check-in has not arrived yet cannot take content.
    const notArrived = new Set([
      ...held,
      ...(await queuedSteps()).pending
        .filter((i) => i.payload.type === 'checkIn')
        .map((i) => i.payload.visitId),
    ])
    if (!steps.interrupted) await sendContent(userId, (id) => !notArrived.has(id), countContent)
    if (steps.sent + steps.refused + contentSent > 0) await invalidateApi(queryClient, '/api/visits')
  })().finally(() => {
    syncing = null
    notify()
  })
  return syncing
}

export async function readVisitOutbox(): Promise<VisitOutboxState> {
  const userId = currentUserId()
  const db = platform().offlineDb
  const [pending, failed, steps] = await Promise.all([
    db.peek<QueuedVisitContent>(PENDING, 200),
    db.peek<FailedVisitContent>(FAILED, 200),
    queuedSteps(),
  ])
  return {
    pending: pending.filter((i) => i.payload.userId === userId),
    failed: failed.filter((i) => i.payload.userId === userId),
    steps: steps.pending.filter((i) => i.payload.userId === userId),
    failedSteps: steps.failed.filter((i) => i.payload.userId === userId),
    syncing: syncing !== null,
  }
}

export type VisitSyncState = 'sent' | 'sending' | 'waiting' | 'refused'

/** Where the visit stands between this device and the server. */
export function visitSyncState(visitId: string, outbox: VisitOutboxState): VisitSyncState {
  const refused =
    outbox.failedSteps.some((i) => i.payload.visitId === visitId) ||
    outbox.failed.some((i) => i.payload.visitId === visitId)
  if (refused) return 'refused'
  const queued =
    outbox.steps.some((i) => i.payload.visitId === visitId) ||
    outbox.pending.some((i) => i.payload.visitId === visitId)
  if (!queued) return 'sent'
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  return outbox.syncing && online ? 'sending' : 'waiting'
}

export function useVisitOutbox(): VisitOutboxState {
  const [state, setState] = useState<VisitOutboxState>(EMPTY_STATE)
  useEffect(() => {
    let active = true
    const update = () =>
      void readVisitOutbox()
        .then((next) => active && setState(next))
        .catch(() => {})
    update()
    listeners.add(update)
    return () => {
      active = false
      listeners.delete(update)
    }
  }, [])
  return state
}

/** Retries when the device comes back online, on return to the app, and every minute. */
export function startVisitSync(): () => void {
  const run = () => void syncVisits().catch(() => {})
  window.addEventListener('online', run)
  const stopResume = platform().app.onResume(run)
  const timer = window.setInterval(run, 60_000)
  run()
  return () => {
    window.removeEventListener('online', run)
    stopResume()
    window.clearInterval(timer)
  }
}
