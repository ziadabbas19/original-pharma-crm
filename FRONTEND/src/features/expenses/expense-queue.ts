import type {
  ExpenseCityTotalDto,
  ExpenseDayDto,
  ExpenseLineDto,
  ExpenseMonthDto,
} from '@/api/generated/model'

/**
 * The rules of the expense outbox, kept free of app wiring so they can be tested alone. Changes made
 * on the phone are queued (offline or not) and shown at once on top of the last copy from the
 * server; the server applies each field's latest change (changedAt), so nothing written offline is
 * lost when another device changed the same line.
 */

export type ExpenseChange =
  | {
      type: 'create'
      lineId: string
      userId: string
      day: string
      cityId: string
      cityName: string
      cityNameAr: string | null
      amount: number
      note: string | null
      changedAt: string
    }
  | {
      type: 'update'
      lineId: string
      userId: string
      day: string
      amount?: number
      note?: string
      changedAt: string
    }
  | { type: 'remove'; lineId: string; userId: string; day: string; changedAt: string }
  | { type: 'dayNote'; userId: string; day: string; note: string; changedAt: string }

/** Amounts in piasters, so sums of EGP amounts never drift (0.1 + 0.2). */
export function toPiasters(amount: number): number {
  return Math.round(amount * 100)
}

export function sumAmounts(amounts: readonly number[]): number {
  return amounts.reduce((sum, a) => sum + toPiasters(a), 0) / 100
}

/** Parses what a person typed ("12.5", "12,50", Arabic digits) into EGP with two decimals, or null. */
export function parseAmount(input: string): number | null {
  const western = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.')
    .replace(/\s/g, '')
  if (!/^\d{1,8}(\.\d{0,2})?$/.test(western)) return null
  return toPiasters(Number(western)) / 100
}

export interface DayView {
  lines: (ExpenseLineDto & { queued?: boolean })[]
  total: number
  monthTotal: number
  note: string | null
  queued: number
}

/**
 * The day as the rep should see it: the server's copy with the queued changes of this rep and day
 * applied in order. The month total moves by the same difference as the day total.
 */
export function applyQueued(day: ExpenseDayDto, changes: readonly ExpenseChange[]): DayView {
  const mine = changes.filter((c) => c.userId === day.userId && c.day === day.day)
  let lines: DayView['lines'] = day.lines.map((l) => ({ ...l }))
  let note = day.note
  for (const change of mine) {
    switch (change.type) {
      case 'create':
        if (!lines.some((l) => l.id === change.lineId)) {
          lines.push({
            id: change.lineId,
            userId: change.userId,
            userName: day.userName,
            day: change.day,
            cityId: change.cityId,
            cityName: change.cityName,
            cityNameAr: change.cityNameAr,
            amount: change.amount,
            originalAmount: null,
            kind: 'manual',
            note: change.note,
            createdAt: change.changedAt,
            updatedAt: null,
            updatedByName: null,
            queued: true,
          })
        }
        break
      case 'update':
        lines = lines.map((l) => {
          if (l.id !== change.lineId) return l
          const amount = change.amount ?? l.amount
          const kind =
            l.kind === 'manual'
              ? 'manual'
              : l.originalAmount !== null && amount !== l.originalAmount
                ? 'edited'
                : 'auto'
          return {
            ...l,
            amount,
            kind,
            note: change.note === undefined ? l.note : change.note || null,
            queued: true,
          }
        })
        break
      case 'remove':
        lines = lines.filter((l) => l.id !== change.lineId)
        break
      case 'dayNote':
        note = change.note || null
        break
    }
  }
  const total = sumAmounts(lines.map((l) => l.amount))
  return {
    lines,
    total,
    monthTotal: (toPiasters(day.monthTotal) + toPiasters(total) - toPiasters(day.total)) / 100,
    note,
    queued: mine.length,
  }
}

/** A queued change the server refused for good (wrong day, no access): it is dropped, the rest go on. */
export function isPermanentRefusal(status: number): boolean {
  return status >= 400 && status < 500 && ![401, 408, 425, 429].includes(status)
}

/**
 * The month as the rep should see it with their queued changes applied: each changed day is
 * recomputed from its lines, then the month total, the days with expenses and the city totals.
 */
export function applyQueuedToMonth(
  month: ExpenseMonthDto,
  changes: readonly ExpenseChange[],
): ExpenseMonthDto {
  const mine = changes.filter((c) => c.userId === month.userId && c.day >= month.from && c.day <= month.to)
  if (mine.length === 0) return month

  const byDay = new Map(month.days.map((d) => [d.day, d]))
  for (const day of new Set(mine.map((c) => c.day))) {
    const base = byDay.get(day)
    const view = applyQueued(
      {
        userId: month.userId,
        userName: month.userName,
        day,
        lines: base?.lines ?? [],
        total: base?.total ?? 0,
        note: base?.note ?? null,
        managerNote: base?.managerNote ?? null,
        managerNoteByName: null,
        monthTotal: 0,
        canEdit: true,
        canEditNote: true,
        canManage: false,
        editableFrom: month.from,
        today: month.to,
      },
      mine,
    )
    byDay.set(day, {
      day,
      lines: view.lines,
      total: view.total,
      note: view.note,
      managerNote: base?.managerNote ?? null,
    })
  }

  const days = [...byDay.values()]
    .filter((d) => d.lines.length > 0 || d.note || d.managerNote)
    .sort((a, b) => a.day.localeCompare(b.day))
  const lines = days.flatMap((d) => d.lines)
  const cities = new Map<string, ExpenseCityTotalDto & { daySet: Set<string> }>()
  for (const line of lines) {
    const city = cities.get(line.cityId) ?? {
      cityId: line.cityId,
      cityName: line.cityName,
      cityNameAr: line.cityNameAr,
      total: 0,
      days: 0,
      daySet: new Set<string>(),
    }
    city.total = (toPiasters(city.total) + toPiasters(line.amount)) / 100
    city.daySet.add(line.day)
    city.days = city.daySet.size
    cities.set(line.cityId, city)
  }

  return {
    ...month,
    total: sumAmounts(lines.map((l) => l.amount)),
    daysWithExpenses: days.filter((d) => d.lines.length > 0).length,
    byCity: [...cities.values()]
      .map(({ daySet: _days, ...city }) => city)
      .sort((a, b) => b.total - a.total || a.cityName.localeCompare(b.cityName)),
    byDay: days.map((d) => ({
      day: d.day,
      total: d.total,
      lineCount: d.lines.length,
      hasNote: Boolean(d.note || d.managerNote),
      hasEdited: d.lines.some((l) => l.kind === 'edited'),
    })),
    days,
  }
}
