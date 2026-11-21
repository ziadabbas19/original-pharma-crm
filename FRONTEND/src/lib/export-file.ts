import { platform, type ExportOutcome } from '@/lib/platform'
import { toast } from '@/lib/toast'
import i18n from '@/lib/i18n'

/** Byte order mark: Excel needs it to read Arabic text in a CSV as UTF-8. */
const BOM = '\uFEFF'

/**
 * Hands a CSV export to the person the way their device can take it: a download in a browser,
 * Android's "Save as" screen in the app (or the share sheet with `share`). Confirms with a toast.
 */
export async function exportCsv(
  name: string,
  text: string,
  options: { share?: boolean } = {},
): Promise<ExportOutcome> {
  const file = { name, mimeType: 'text/csv', data: new Blob([BOM, text], { type: 'text/csv;charset=utf-8' }) }
  const files = platform().files
  const outcome = options.share ? await files.share(file) : await files.save(file)
  if (outcome === 'saved') toast.show({ tone: 'success', message: i18n.t('exports.saved', { name }) })
  return outcome
}
