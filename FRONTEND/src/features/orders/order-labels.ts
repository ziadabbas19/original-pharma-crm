import type { DeliveryStatus, OrderStatus, PlaceType } from '@/api/generated/model'

export const ORDER_STATUSES: OrderStatus[] = ['submitted', 'approved', 'rejected', 'cancelled']
export const PLACE_TYPES: PlaceType[] = ['pharmacy', 'warehouse', 'shop', 'other']

export const STATUS_BADGE: Record<
  OrderStatus,
  'default' | 'secondary' | 'success' | 'destructive' | 'outline'
> = {
  submitted: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'outline',
}

export const DELIVERY_STATUSES: NonNullable<DeliveryStatus>[] = ['notDelivered', 'delivered']

export const DELIVERY_BADGE: Record<NonNullable<DeliveryStatus>, 'success' | 'warning'> = {
  notDelivered: 'warning',
  delivered: 'success',
}

/** Value of the "Other" choice in the collection method picker (not a real id). */
export const OTHER_METHOD = 'other'

/** Product name in the current language. */
export function productName(p: { nameAr: string; nameEn: string }, language: string | undefined): string {
  return language === 'en' ? p.nameEn : p.nameAr || p.nameEn
}
