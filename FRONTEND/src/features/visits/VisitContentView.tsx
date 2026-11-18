import { CheckCheckIcon, MessageSquareReplyIcon, PackageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { VisitDetailDto } from '@/api/generated/model'
import { Badge } from '@/components/ui/badge'
import { productName } from '@/features/orders/order-labels'
import { ProductThumb } from '@/features/orders/ProductPicker'
import { formatDateTime, formatList } from '@/lib/format'
import { CATEGORY_BADGE } from './visit-labels'

/** Feedback, who saw it, the replies and the products discussed: the same for the rep and their managers. */
export function VisitContentView({ visit }: { visit: VisitDetailDto }) {
  const { t, i18n } = useTranslation()
  const feedback = visit.feedback
  return (
    <div className="grid gap-4">
      <section className="grid gap-2">
        <h3 className="text-sm font-medium">{t('visits.feedback.title')}</h3>
        {feedback ? (
          <div className="grid gap-2 rounded-lg border p-3 text-sm">
            {feedback.category && (
              <Badge variant={CATEGORY_BADGE[feedback.category]} className="w-fit">
                {t(`visits.feedback.categories.${feedback.category}`)}
              </Badge>
            )}
            <p className="whitespace-pre-line">{feedback.text}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(feedback.updatedAt)}</p>
            {feedback.seenBy.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCheckIcon className="size-3.5 shrink-0 text-success" aria-hidden />
                {t('visits.feedback.seenBy', { names: formatList(feedback.seenBy.map((s) => s.userName)) })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('visits.feedback.none')}</p>
        )}
      </section>

      {visit.replies.length > 0 && (
        <section className="grid gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <MessageSquareReplyIcon className="size-4 text-muted-foreground" aria-hidden />
            {t('visits.feedback.replies')}
          </h3>
          <ul className="grid gap-2">
            {visit.replies.map((reply) => (
              <li key={reply.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="whitespace-pre-line">{reply.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reply.authorName} · {formatDateTime(reply.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <PackageIcon className="size-4 text-muted-foreground" aria-hidden />
          {t('visits.products.title')}
        </h3>
        {visit.products.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('visits.products.none')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {visit.products.map((product) => (
              <li key={product.productId} className="flex items-center gap-3 p-2">
                <ProductThumb url={product.thumbnailUrl} className="size-10" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{productName(product, i18n.resolvedLanguage)}</p>
                  {product.note && <p className="text-xs text-muted-foreground">{product.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
