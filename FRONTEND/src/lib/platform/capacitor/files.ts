import { registerPlugin } from '@capacitor/core'
import type { ExportFile, ExportOutcome, FileExporter } from '../types'

/** Local native plugin in android/app (FileSharePlugin.java). */
interface FileSharePlugin {
  save(options: { filename: string; mimeType: string; base64: string }): Promise<{ saved: boolean }>
  share(options: {
    filename: string
    mimeType: string
    base64: string
    title?: string
  }): Promise<{ shared: boolean }>
}

const Native = registerPlugin<FileSharePlugin>('FileShare')

async function toBase64(data: Blob): Promise<string> {
  const bytes = new Uint8Array(await data.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

/**
 * Android: the WebView cannot download a file the page built, so the bytes go to the native side,
 * which opens Android's "Save as" screen or the share sheet.
 */
export class CapacitorFileExporter implements FileExporter {
  async save(file: ExportFile): Promise<ExportOutcome> {
    const { saved } = await Native.save({
      filename: file.name,
      mimeType: file.mimeType,
      base64: await toBase64(file.data),
    })
    return saved ? 'saved' : 'cancelled'
  }

  async share(file: ExportFile): Promise<ExportOutcome> {
    await Native.share({
      filename: file.name,
      mimeType: file.mimeType,
      base64: await toBase64(file.data),
      title: file.name,
    })
    return 'shared'
  }
}
