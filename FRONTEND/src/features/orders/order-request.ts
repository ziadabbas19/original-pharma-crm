import type { CreateOrderRequest, OrderDto, ProductDto, UpdateOrderRequest } from '@/api/generated/model'
import { OTHER_METHOD } from './order-labels'
import type { FormLine, OrderFormValues } from './order-form-values'

/** The editable fields as the API expects them (exactly one of collectionMethodId / collectionMethodOther). */
export function toUpdateRequest(values: OrderFormValues): UpdateOrderRequest {
  const other = values.collection === OTHER_METHOD
  return {
    orderDate: values.orderDate,
    placeType: values.placeType,
    placeName: values.placeName.trim(),
    customerId: values.customerId,
    collectionMethodId: other ? null : values.collection,
    collectionMethodOther: other ? values.collectionOther.trim() : null,
    notes: values.notes.trim() || null,
    lines: values.lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      discountPercent: Number(l.discount) || 0,
    })),
  }
}

export function toCreateRequest(values: OrderFormValues, clientRequestId: string): CreateOrderRequest {
  return { clientRequestId, ...toUpdateRequest(values) }
}

/** Form values of an existing order (edit). Lines keep the order's price snapshot. */
export function fromOrder(order: OrderDto, products: ProductDto[] | undefined): OrderFormValues {
  const byId = new Map((products ?? []).map((p) => [p.id, p]))
  return {
    orderDate: order.orderDate,
    placeType: order.placeType,
    placeName: order.placeName,
    customerId: order.customerId ?? null,
    collection: order.collectionMethodId ?? OTHER_METHOD,
    collectionOther: order.collectionMethodOther ?? '',
    notes: order.notes ?? '',
    lines: order.lines.map((l): FormLine => ({
      productId: l.productId,
      nameAr: l.productNameAr,
      nameEn: l.productNameEn,
      thumbnailUrl: l.thumbnailUrl,
      unitPrice: l.unitPrice,
      stock: byId.get(l.productId)?.stockQuantity ?? null,
      quantity: l.quantity,
      discount: l.discountPercent ? String(l.discountPercent) : '',
    })),
  }
}

/** Form values of a queued request that the server refused (fix and send again). */
export function fromRequest(
  request: CreateOrderRequest,
  products: ProductDto[] | undefined,
): OrderFormValues {
  const byId = new Map((products ?? []).map((p) => [p.id, p]))
  return {
    orderDate: request.orderDate,
    placeType: request.placeType,
    placeName: request.placeName,
    customerId: request.customerId ?? null,
    collection: request.collectionMethodId ?? (request.collectionMethodOther ? OTHER_METHOD : ''),
    collectionOther: request.collectionMethodOther ?? '',
    notes: request.notes ?? '',
    lines: request.lines.flatMap((l): FormLine[] => {
      const p = byId.get(l.productId)
      if (!p) return [] // no longer available to this rep
      return [
        {
          productId: p.id,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          thumbnailUrl: p.thumbnailUrl,
          unitPrice: p.price,
          stock: p.stockQuantity,
          quantity: l.quantity,
          discount: l.discountPercent ? String(l.discountPercent) : '',
        },
      ]
    }),
  }
}
