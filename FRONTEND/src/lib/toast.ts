import type { ToastRequest } from '@/lib/errors/types'

/**
 * App-wide toasts: a tiny store the <Toaster /> renders. Errors reach it through handleError; other
 * code may show a success or info toast with toast.show.
 */
export interface Toast extends ToastRequest {
  id: number
}

const MAX_VISIBLE = 3
const DURATION_MS = 5_000
/** Messages with a reference stay longer so the id can be read or copied. */
const DURATION_WITH_REFERENCE_MS = 9_000

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit() {
  for (const listener of listeners) listener()
}

export const toast = {
  show(request: ToastRequest): number {
    const id = nextId++
    toasts = [...toasts, { ...request, id }].slice(-MAX_VISIBLE)
    timers.set(
      id,
      setTimeout(() => toast.dismiss(id), request.reference ? DURATION_WITH_REFERENCE_MS : DURATION_MS),
    )
    emit()
    return id
  },
  dismiss(id: number): void {
    const timer = timers.get(id)
    if (timer) clearTimeout(timer)
    timers.delete(id)
    if (!toasts.some((t) => t.id === id)) return
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  snapshot(): Toast[] {
    return toasts
  },
}
