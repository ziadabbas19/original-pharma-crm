/**
 * What the rep Home lists for today: the visit in progress, the doctors on the rep's list not visited
 * yet today, then today's finished visits. There is no visit schedule in the system, so "next" means the
 * first doctor on the list that has not been visited today. No React here, so the unit tests load it.
 */

export interface PlanVisit {
  id: string
  customerId: string
  customerName: string
  customerNameAr?: string | null
  status: 'inProgress' | 'completed' | 'cancelled'
  checkInAt: string
}

export interface PlanCustomer {
  id: string
  type: 'doctor' | 'pharmacy'
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
  /** Visits finished today. */
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
}): TodayPlan {
  const { visits, customers, activeCustomerId = null, waitingLimit = 5 } = input
  const byId = new Map(customers.map((c) => [c.id, c]))
  const visited = new Set(visits.map((v) => v.customerId))
  if (activeCustomerId) visited.add(activeCustomerId)

  const open = visits.find((v) => v.status === 'inProgress')
  const runningId = activeCustomerId ?? open?.customerId ?? null
  const items: PlanItem[] = []
  if (runningId) {
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

  const waiting = customers
    .filter((c) => c.type === 'doctor' && !visited.has(c.id))
    .toSorted((a, b) => a.name.localeCompare(b.name))
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
    .filter((v) => v.status === 'completed')
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
