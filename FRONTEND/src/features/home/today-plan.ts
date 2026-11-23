/**
 * What the rep Home lists for today: the visit in progress, the doctors on the rep's list not visited
 * yet today (only those of today's area, in the order the rep put them), then today's finished visits.
 * "Next" is the first doctor of that list. AM visits (morning places) are counted apart and never
 * count for the daily doctor target. No React here, so the unit tests load it.
 */
import { applyOrder } from './reorder.ts'

export type PlanCustomerType = 'doctor' | 'pharmacy' | 'hospital'

export interface PlanVisit {
  id: string
  customerId: string
  customerName: string
  customerNameAr?: string | null
  status: 'inProgress' | 'completed' | 'cancelled'
  checkInAt: string
  customerType?: PlanCustomerType
}

export interface PlanCustomer {
  id: string
  type: PlanCustomerType
  townId?: string | null
  name: string
  nameAr?: string | null
  townName?: string | null
  townNameAr?: string | null
}

export interface PlanItem {
  kind: 'inProgress' | 'waiting' | 'done'
  customerId: string
  name: string
  nameAr?: string | null
  townName?: string | null
  townNameAr?: string | null
  /** Check-in time of a visit (none while waiting). */
  at?: string
}

export interface TodayPlan {
  /** Doctor and pharmacy visits finished today (AM visits are not counted). */
  done: number
  items: PlanItem[]
  /** The doctor "Start next visit" opens (null when everyone was visited or a visit is running). */
  next: PlanCustomer | null
  /** A visit is running on this device or on the server. */
  inProgress: boolean
}

export function todayPlan(input: {
  visits: readonly PlanVisit[]
  customers: readonly PlanCustomer[]
  /** The visit open on this device (it may not have reached the server yet). */
  activeCustomerId?: string | null
  /** At most this many waiting doctors are listed. */
  waitingLimit?: number
  /** Only doctors in these towns wait for today (null or undefined: every doctor on the list). */
  townIds?: readonly string[] | null
  /** The rep's order for today; doctors it does not name follow, by name. */
  order?: readonly string[] | null
}): TodayPlan {
  const { visits, customers, activeCustomerId = null, waitingLimit = 5, townIds = null, order = null } = input
  const byId = new Map(customers.map((c) => [c.id, c]))
  const visited = new Set(visits.map((v) => v.customerId))
  if (activeCustomerId) visited.add(activeCustomerId)
  const isAm = (customerId: string, visit?: PlanVisit) =>
    (byId.get(customerId)?.type ?? visit?.customerType) === 'hospital'
  const inArea = townIds ? new Set(townIds) : null

  const open = visits.find((v) => v.status === 'inProgress')
  const runningId = activeCustomerId ?? open?.customerId ?? null
  const items: PlanItem[] = []
  // An AM visit in progress shows in the AM list, not among the doctors.
  if (runningId && !isAm(runningId, open)) {
    const customer = byId.get(runningId)
    items.push({
      kind: 'inProgress',
      customerId: runningId,
      name: customer?.name ?? open?.customerName ?? '',
      nameAr: customer?.nameAr ?? open?.customerNameAr,
      townName: customer?.townName,
      townNameAr: customer?.townNameAr,
      at: open?.customerId === runningId ? open.checkInAt : undefined,
    })
  }

  const waiting = applyOrder(
    customers
      .filter((c) => c.type === 'doctor' && !visited.has(c.id) && (!inArea || inArea.has(c.townId ?? '')))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
    order,
    (c) => c.id,
  )
  for (const customer of waiting.slice(0, waitingLimit)) {
    items.push({
      kind: 'waiting',
      customerId: customer.id,
      name: customer.name,
      nameAr: customer.nameAr,
      townName: customer.townName,
      townNameAr: customer.townNameAr,
    })
  }

  const finished = visits
    .filter((v) => v.status === 'completed' && !isAm(v.customerId, v))
    .toSorted((a, b) => new Date(b.checkInAt).getTime() - new Date(a.checkInAt).getTime())
  for (const visit of finished) {
    const customer = byId.get(visit.customerId)
    items.push({
      kind: 'done',
      customerId: visit.customerId,
      name: customer?.name ?? visit.customerName,
      nameAr: customer?.nameAr ?? visit.customerNameAr,
      townName: customer?.townName,
      townNameAr: customer?.townNameAr,
      at: visit.checkInAt,
    })
  }

  return {
    done: finished.length,
    items,
    next: runningId ? null : (waiting[0] ?? null),
    inProgress: runningId !== null,
  }
}

export type AmStatus = 'waiting' | 'inProgress' | 'done'

/**
 * Today's AM list against today's visits: how many places were visited (a completed visit today) and
 * the state of each place. Kept apart from the doctor target.
 */
export function amProgress(input: {
  placeIds: readonly string[]
  visits: readonly PlanVisit[]
  activeCustomerId?: string | null
}): { done: number; total: number; status: Record<string, AmStatus> } {
  const { placeIds, visits, activeCustomerId = null } = input
  const status: Record<string, AmStatus> = {}
  for (const id of placeIds) {
    const own = visits.filter((v) => v.customerId === id)
    status[id] = own.some((v) => v.status === 'completed')
      ? 'done'
      : activeCustomerId === id || own.some((v) => v.status === 'inProgress')
        ? 'inProgress'
        : 'waiting'
  }
  return {
    done: placeIds.filter((id) => status[id] === 'done').length,
    total: placeIds.length,
    status,
  }
}
