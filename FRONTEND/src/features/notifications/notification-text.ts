import type { TFunction } from 'i18next'
import type { NotificationDto } from '@/api/generated/model'
import { localizedName } from '@/lib/format'

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
  }
  const title = t(`notifications.types.${n.type}`, values)
  const body =
    data.excerpt ?? data.note ?? (data.placeName ? `${data.placeName} · ${data.actorName ?? ''}` : '')
  return { title, body }
}

/** Orders and visits a notification points at. */
export function notificationIsAboutOrder(n: NotificationDto): boolean {
  return n.type.startsWith('order')
}
