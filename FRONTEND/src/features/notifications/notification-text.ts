import type { TFunction } from 'i18next'
import type { NotificationDto } from '@/api/generated/model'
import { formatWeekRange, localizedName } from '@/lib/format'

interface NotificationData {
  orderNumber?: string
  placeName?: string
  actorName?: string
  note?: string | null
  repName?: string
  authorName?: string
  customerName?: string
  customerNameAr?: string | null
  category?: string | null
  excerpt?: string
  /** Reason codes of a suspicious location flag. */
  signals?: string[]
  /** Weekly plans: the week's first day, the reviewer, and whether an approved plan was reopened. */
  weekStart?: string
  reviewerName?: string
  reopened?: boolean
}

/** Title and body in the reader's language, built from the values stored with the notification. */
export function notificationText(n: NotificationDto, t: TFunction): { title: string; body: string } {
  const data = n.data as NotificationData
  const customer = localizedName(data.customerName, data.customerNameAr)
  const values = {
    number: data.orderNumber ?? '',
    place: data.placeName ?? '',
    actor: data.actorName ?? '',
    rep: data.repName ?? '',
    author: data.authorName ?? '',
    customer,
    reviewer: data.reviewerName ?? '',
    week: data.weekStart ? formatWeekRange(data.weekStart) : '',
  }
  const key = n.type === 'planReturned' && data.reopened ? 'planReopened' : n.type
  const title = t(`notifications.types.${key}`, values)
  const body =
    n.type === 'suspiciousLocation'
      ? [
          customer,
          ...(data.signals ?? []).map((code) =>
            t([`flags.signals.${code}`, `visits.reviewReasons.${code}`], { defaultValue: code }),
          ),
        ]
          .filter(Boolean)
          .join(' · ')
      : (data.excerpt ?? data.note ?? (data.placeName ? `${data.placeName} · ${data.actorName ?? ''}` : ''))
  return { title, body }
}

/** Orders and visits a notification points at. */
export function notificationIsAboutOrder(n: NotificationDto): boolean {
  return n.type.startsWith('order')
}

/** A weekly plan was sent for review, approved or returned: the entity is the plan. */
export function notificationIsAboutPlan(n: NotificationDto): boolean {
  return n.type.startsWith('plan')
}

/** The first day of the plan's week, for the rep's plan screen. */
export function notificationPlanWeek(n: NotificationDto): string | undefined {
  return (n.data as NotificationData).weekStart
}

/** A rep was flagged for a suspicious location: the entity is the rep, the review page is the target. */
export function notificationIsAboutSuspiciousLocation(n: NotificationDto): boolean {
  return n.type === 'suspiciousLocation'
}
