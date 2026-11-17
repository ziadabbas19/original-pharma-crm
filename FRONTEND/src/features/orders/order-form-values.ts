import type { PlaceType } from '@/api/generated/model'
import { toDateInputValue } from '@/lib/format'

export interface FormLine {
  productId: string
  nameAr: string
  nameEn: string
  thumbnailUrl?: string | null
  unitPrice: number
  /** Current stock, when known (null for products no longer visible). */
  stock: number | null
  quantity: number
  /** Kept as typed so decimals can be entered. */
  discount: string
}

export interface OrderFormValues {
  orderDate: string
  placeType: PlaceType
  placeName: string
  customerId: string | null
  /** A collection method id, OTHER_METHOD, or '' when nothing is chosen yet. */
  collection: string
  collectionOther: string
  notes: string
  lines: FormLine[]
}

export function emptyOrderForm(): OrderFormValues {
  return {
    orderDate: toDateInputValue(new Date()),
    placeType: 'pharmacy',
    placeName: '',
    customerId: null,
    collection: '',
    collectionOther: '',
    notes: '',
    lines: [],
  }
}
