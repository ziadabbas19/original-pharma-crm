import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, ArrowRightIcon, ImagePlusIcon, Loader2Icon, Trash2Icon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  productsAddBrochureImage,
  productsRemoveBrochureImage,
  productsReorderBrochureImages,
} from '@/api/generated/endpoints'
import type { ProductDto, ProductImageDto } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { IMAGE_ACCEPT } from '@/features/profile/AvatarEditor'
import { compressImage, ImageTooLargeError, ImageUnreadableError } from '@/lib/compress-image'
import { handleError, UserFacingError } from '@/lib/errors'
import { useBrochurePage } from './use-brochure-page'

const MAX_PAGES = 5

function Thumb({ image }: { image: ProductImageDto }) {
  const { src } = useBrochurePage(image.url)
  return src ? (
    <img src={src} alt="" className="size-full object-cover" />
  ) : (
    <Skeleton className="size-full" />
  )
}

/**
 * Brochure pages of a product (products:manage): add up to five (shrunk on this device to 1600 px and
 * about 1.5 MB before upload), remove, and move a page earlier or later.
 */
export function BrochureEditor({
  product,
  onChange,
}: {
  product: ProductDto
  onChange: (product: ProductDto) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const images = product.images ?? []
  const rtl = i18n.dir() === 'rtl'
  const Earlier = rtl ? ArrowRightIcon : ArrowLeftIcon
  const Later = rtl ? ArrowLeftIcon : ArrowRightIcon

  const run = async (action: () => Promise<ProductDto>, context: string) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await action())
      await queryClient.invalidateQueries({ queryKey: ['/api/products'] })
    } catch (err) {
      setError(handleError(err, { silent: true, context }))
    } finally {
      setBusy(false)
    }
  }

  const add = async (file: File | undefined) => {
    if (!file) return
    let compressed: Blob
    try {
      compressed = await compressImage(file)
    } catch (err) {
      setError(
        new UserFacingError(
          err instanceof ImageTooLargeError
            ? t('catalog.brochure.tooLarge')
            : err instanceof ImageUnreadableError
              ? t('catalog.brochure.unreadable')
              : t('errors.kind.unknown'),
        ),
      )
      return
    }
    const ext = compressed.type === 'image/webp' ? 'webp' : 'jpg'
    const upload = new File([compressed], `brochure.${ext}`, { type: compressed.type })
    await run(() => productsAddBrochureImage(product.id, { file: upload }), 'products.brochure.add')
  }

  const move = (index: number, by: number) => {
    const ids = images.map((i) => i.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + by, 0, moved)
    void run(() => productsReorderBrochureImages(product.id, { imageIds: ids }), 'products.brochure.order')
  }

  return (
    <fieldset className="grid gap-2 rounded-lg border p-3" data-testid="brochure-editor">
      <legend className="px-1 text-sm font-medium">{t('catalog.brochure.title')}</legend>
      <p className="text-xs text-muted-foreground">{t('catalog.brochure.hint', { max: MAX_PAGES })}</p>
      {images.length > 0 && (
        <ol className="flex flex-wrap gap-3">
          {images.map((image, index) => (
            <li key={image.id} className="grid w-24 gap-1" data-testid="brochure-page">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md border bg-muted">
                <Thumb image={image} />
                <span className="absolute start-1 top-1 rounded bg-background/90 px-1 text-xs font-semibold tabular-nums">
                  {index + 1}
                </span>
              </div>
              <div className="flex justify-between">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={busy || index === 0}
                  aria-label={t('catalog.brochure.earlier')}
                  onClick={() => move(index, -1)}
                >
                  <Earlier />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive"
                  disabled={busy}
                  aria-label={t('catalog.brochure.remove')}
                  onClick={() =>
                    void run(
                      () => productsRemoveBrochureImage(product.id, image.id),
                      'products.brochure.remove',
                    )
                  }
                >
                  <Trash2Icon />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={busy || index === images.length - 1}
                  aria-label={t('catalog.brochure.later')}
                  onClick={() => move(index, 1)}
                >
                  <Later />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={busy || images.length >= MAX_PAGES}
        onClick={() => input.current?.click()}
        data-testid="brochure-add"
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
        {images.length >= MAX_PAGES
          ? t('catalog.brochure.full', { max: MAX_PAGES })
          : t('catalog.brochure.add')}
      </Button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void add(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <FormError error={error} />
    </fieldset>
  )
}
