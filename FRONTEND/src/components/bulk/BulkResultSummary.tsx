import { AlertTriangleIcon, ArchiveIcon, CheckCircle2Icon, Trash2Icon, Undo2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BulkResult } from '@/api/generated/model'
import { formatNumber } from '@/lib/format'

const MAX_LISTED = 8

/** What a bulk request did: per outcome counts, and every blocked item with the reason. */
export function BulkResultSummary({
  result,
  nameOf,
  verb = 'delete',
}: {
  result: BulkResult
  nameOf: (id: string) => string
  verb?: string
}) {
  const { t } = useTranslation()
  const blocked = result.items.filter((i) => i.outcome === 'blocked')
  const rows: { key: string; count: number; icon: typeof Trash2Icon; tone: string }[] = [
    { key: `bulk.done.${verb}`, count: result.deleted, icon: Trash2Icon, tone: 'text-foreground' },
    { key: 'bulk.done.archived', count: result.archived, icon: ArchiveIcon, tone: 'text-foreground' },
    { key: 'bulk.done.restored', count: result.restored, icon: Undo2Icon, tone: 'text-success' },
    { key: 'bulk.done.updated', count: result.updated, icon: CheckCircle2Icon, tone: 'text-success' },
  ]
  return (
    <div className="grid gap-2 text-sm" role="status">
      {rows
        .filter((r) => r.count > 0)
        .map((r) => (
          <p key={r.key} className={`flex items-center gap-2 ${r.tone}`}>
            <r.icon className="size-4 shrink-0" aria-hidden />
            {t(r.key, { count: r.count, value: formatNumber(r.count) })}
          </p>
        ))}
      {blocked.length > 0 && (
        <div className="grid gap-1 rounded-md border border-warning/40 bg-warning/5 p-2">
          <p className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
            {t('bulk.done.blocked', { count: blocked.length, value: formatNumber(blocked.length) })}
          </p>
          <ul className="grid gap-0.5 ps-6">
            {blocked.slice(0, MAX_LISTED).map((item) => (
              <li key={item.id}>
                <span className="font-medium">{nameOf(item.id)}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {t(`bulk.codes.${item.code ?? 'unknown'}`, {
                    defaultValue: t('bulk.codes.unknown'),
                    count: item.usageCount ?? 0,
                    value: formatNumber(item.usageCount ?? 0),
                  })}
                </span>
              </li>
            ))}
          </ul>
          {blocked.length > MAX_LISTED && (
            <p className="ps-6 text-xs text-muted-foreground">
              {t('bulk.andMore', { value: formatNumber(blocked.length - MAX_LISTED) })}
            </p>
          )}
          <p className="ps-6 text-xs text-muted-foreground">{t('bulk.blockedStaySelected')}</p>
        </div>
      )}
    </div>
  )
}
