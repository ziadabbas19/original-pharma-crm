import type { ExportFile, ExportOutcome, FileExporter } from '../types'

/** Browsers: a download link; sharing uses the Web Share API where the browser has it. */
export class WebFileExporter implements FileExporter {
  async save(file: ExportFile): Promise<ExportOutcome> {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(file.data)
    link.download = file.name
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    return 'downloaded'
  }

  async share(file: ExportFile): Promise<ExportOutcome> {
    const shared = new File([file.data], file.name, { type: file.mimeType })
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [shared] })) {
      try {
        await navigator.share({ files: [shared], title: file.name })
        return 'shared'
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      }
    }
    return this.save(file)
  }
}
