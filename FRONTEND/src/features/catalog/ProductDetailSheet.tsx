import type { ProductDto } from '@/api/generated/model'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { localizedName } from '@/lib/format'
import { ProductDetails } from './ProductDetails'

/** A product with its brochure pages, for the management screens (a bottom sheet on phones). */
export function ProductDetailSheet({ product, onClose }: { product: ProductDto; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="product-detail">
        <DialogHeader>
          <DialogTitle>{localizedName(product.nameEn, product.nameAr)}</DialogTitle>
          <DialogDescription>{localizedName(product.nameAr, product.nameEn)}</DialogDescription>
        </DialogHeader>
        <ProductDetails product={product} />
      </DialogContent>
    </Dialog>
  )
}
