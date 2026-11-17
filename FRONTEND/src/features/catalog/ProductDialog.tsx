import { useQueryClient } from '@tanstack/react-query'
import { ImageUpIcon, Loader2Icon, Trash2Icon } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useProductsCreate,
  useProductsRemoveImage,
  useProductsSetImage,
  useProductsUpdate,
} from '@/api/generated/endpoints'
import type { ProductDto, ProductLineDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { ProductThumb } from '@/features/orders/ProductPicker'
import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from '@/features/profile/AvatarEditor'
import { UserFacingError } from '@/lib/errors'
import { localizedName } from '@/lib/format'

/** Create or edit a product; the picture can be added once the product exists. */
export function ProductDialog({
  product: initial,
  lines,
  defaultLineId,
  onClose,
}: {
  product: ProductDto | null
  lines: ProductLineDto[]
  defaultLineId?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const create = useProductsCreate()
  const update = useProductsUpdate()
  const setImage = useProductsSetImage()
  const removeImage = useProductsRemoveImage()
  const fileInput = useRef<HTMLInputElement>(null)
  const [product, setProduct] = useState<ProductDto | null>(initial)
  const [lineId, setLineId] = useState(initial?.productLineId ?? defaultLineId ?? lines[0]?.id ?? '')
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? '')
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [price, setPrice] = useState(initial ? String(initial.price) : '')
  const [stock, setStock] = useState(initial ? String(initial.stockQuantity) : '0')
  const [active, setActive] = useState(initial?.isActive ?? true)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [imageError, setImageError] = useState<unknown>(null)
  const busy = create.isPending || update.isPending

  const priceValue = Number(price.replace(',', '.'))
  const stockValue = Number(stock)
  const problems = {
    names: !nameAr.trim() || !nameEn.trim(),
    line: !lineId,
    price:
      price.trim() === '' ||
      !Number.isFinite(priceValue) ||
      priceValue < 0 ||
      Math.round(priceValue * 100) !== priceValue * 100,
    stock: !Number.isInteger(stockValue) || stockValue < 0,
  }

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['/api/products'] })
    await queryClient.invalidateQueries({ queryKey: ['/api/product-lines'] })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (Object.values(problems).some(Boolean)) return
    const data = {
      productLineId: lineId,
      nameAr: nameAr.trim(),
      nameEn: nameEn.trim(),
      description: description.trim() || null,
      price: priceValue,
      stockQuantity: stockValue,
      isActive: active,
    }
    try {
      const saved = product
        ? await update.mutateAsync({ id: product.id, data })
        : await create.mutateAsync({ data })
      await refresh()
      if (product) onClose()
      else setProduct(saved) // stay open so a picture can be added
    } catch (err) {
      setError(err)
    }
  }

  const upload = async (file: File | undefined) => {
    setImageError(null)
    if (!file || !product) return
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(new UserFacingError(t('images.tooLarge')))
      return
    }
    try {
      setProduct(await setImage.mutateAsync({ id: product.id, data: { file } }))
      await refresh()
    } catch (err) {
      setImageError(err)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? t('catalog.editProduct') : t('catalog.addProduct')}</DialogTitle>
          <DialogDescription>
            {product && !initial ? t('catalog.createdAddPicture') : t('catalog.productHint')}
          </DialogDescription>
        </DialogHeader>

        {product && (
          <div className="flex items-center gap-4 rounded-lg border p-3">
            <ProductThumb url={product.thumbnailUrl} className="size-20" />
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">{t('catalog.pictureHint')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={setImage.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  {setImage.isPending ? <Loader2Icon className="animate-spin" /> : <ImageUpIcon />}
                  {product.imageUrl ? t('catalog.replacePicture') : t('catalog.uploadPicture')}
                </Button>
                {product.imageUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={removeImage.isPending}
                    onClick={async () => {
                      setProduct(await removeImage.mutateAsync({ id: product.id }))
                      await refresh()
                    }}
                  >
                    <Trash2Icon />
                    {t('catalog.removePicture')}
                  </Button>
                )}
              </div>
              <FormError error={imageError} />
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void upload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        )}

        <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          <div className="grid gap-2">
            <Label htmlFor="product-line">{t('catalog.line')}</Label>
            <NativeSelect
              id="product-line"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              aria-invalid={touched && problems.line}
            >
              <option value="">{t('orders.form.choose')}</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {localizedName(l.nameEn, l.nameAr)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="product-name-ar">{t('catalog.nameAr')}</Label>
              <Input
                id="product-name-ar"
                dir="rtl"
                maxLength={200}
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                aria-invalid={touched && !nameAr.trim()}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="product-name-en">{t('catalog.nameEn')}</Label>
              <Input
                id="product-name-en"
                dir="ltr"
                maxLength={200}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                aria-invalid={touched && !nameEn.trim()}
              />
            </div>
          </div>
          {touched && problems.names && (
            <p className="text-sm text-destructive">{t('catalog.namesRequired')}</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="product-price">{t('catalog.price')}</Label>
              <Input
                id="product-price"
                dir="ltr"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={touched && problems.price}
              />
              {touched && problems.price && (
                <p className="text-sm text-destructive">{t('catalog.priceInvalid')}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="product-stock">{t('catalog.stock')}</Label>
              <Input
                id="product-stock"
                dir="ltr"
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/[^0-9]/g, ''))}
                aria-invalid={touched && problems.stock}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="product-description">{t('catalog.description')}</Label>
            <Textarea
              id="product-description"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            {t('catalog.active')}
          </Label>
          <FormError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {product && !initial ? t('common.done') : t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
