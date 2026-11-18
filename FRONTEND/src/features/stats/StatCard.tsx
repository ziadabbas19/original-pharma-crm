import { BarChart3Icon, DownloadIcon, Loader2Icon, TableIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getStatsExportUrl } from '@/api/generated/endpoints'
import type { StatRow } from '@/api/generated/model'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { apiFetch } from '@/lib/api-client'
import { formatMoney, formatNumber, localizedName } from '@/lib/format'
import { BarList } from './charts'
import { useStatsContext } from './stats-context'

/** Downloads one statistics table as CSV (the server checks stats:export). */
export function ExportButton({ table }: { table: string }) {
  const { t, i18n } = useTranslation()
  const { params, canExport, section } = useStatsContext()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!canExport) return null

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      const text = await apiFetch<string>(
        getStatsExportUrl({ ...params, section, table, lang: i18n.resolvedLanguage === 'en' ? 'en' : 'ar' }),
        { headers: { Accept: 'text/csv' } },
      )
      // Excel needs the byte order mark to read Arabic as UTF-8.
      const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${section}-${table}-${params.From ?? ''}-${params.To ?? ''}.csv`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        disabled={busy}
        aria-label={t('stats.exportCsv')}
        title={t('stats.exportCsv')}
        onClick={() => void download()}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      </Button>
      {error !== null && <FormError error={error} />}
    </>
  )
}

/** Card with a title and the CSV action. */
export function StatCard({
  title,
  table,
  actions,
  children,
}: {
  title: string
  table?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="min-w-0 gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <div className="flex items-center gap-1">
          {actions}
          {table && <ExportButton table={table} />}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-4">{children}</CardContent>
    </Card>
  )
}

export interface BreakdownColumn {
  key: 'count' | 'value' | 'quantity'
  label: string
  money?: boolean
}

const TOP_BARS = 8

function cell(row: StatRow, column: BreakdownColumn): string {
  const value = row[column.key] ?? 0
  return column.money ? formatMoney(value) : formatNumber(value, 1)
}

/** A breakdown as ranked bars, with a table view of every row and its CSV export. */
export function BreakdownCard({
  title,
  table,
  rows,
  columns,
}: {
  title: string
  table: string
  rows: StatRow[]
  /** The first column is the one the bars show. */
  columns: BreakdownColumn[]
}) {
  const { t } = useTranslation()
  const [asTable, setAsTable] = useState(false)
  const plotted = columns[0]
  const sorted = [...rows].sort((a, b) => (b[plotted.key] ?? 0) - (a[plotted.key] ?? 0))

  return (
    <StatCard
      title={title}
      table={table}
      actions={
        rows.length > 0 && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-pressed={asTable}
            aria-label={asTable ? t('stats.showChart') : t('stats.showTable')}
            title={asTable ? t('stats.showChart') : t('stats.showTable')}
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? <BarChart3Icon /> : <TableIcon />}
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('stats.noData')}</p>
      ) : asTable ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('stats.name')}</TableHead>
                {columns.map((c) => (
                  <TableHead key={c.key} className="text-end">
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="max-w-48 truncate">{localizedName(row.name, row.nameAr)}</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.key} className="text-end tabular-nums">
                      {cell(row, c)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <>
          <BarList
            items={sorted.slice(0, TOP_BARS).map((row) => ({
              key: row.key,
              label: localizedName(row.name, row.nameAr),
              value: row[plotted.key] ?? 0,
              display: cell(row, plotted),
              detail: columns.map((c) => `${c.label}: ${cell(row, c)}`).join(' · '),
            }))}
          />
          {sorted.length > TOP_BARS && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('stats.moreInTable', { value: formatNumber(sorted.length - TOP_BARS) })}
            </p>
          )}
        </>
      )}
    </StatCard>
  )
}
