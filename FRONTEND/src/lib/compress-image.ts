/**
 * Shrinks a picture in the browser before upload: at most `maxSide` pixels on the long side, WebP (or
 * JPEG where the browser cannot write WebP) at about `quality`, lowered step by step until the result
 * fits `maxBytes`. Throws when the file is not a picture or cannot be made small enough.
 */
export class ImageTooLargeError extends Error {}
export class ImageUnreadableError extends Error {}

export async function compressImage(
  file: Blob,
  {
    maxSide = 1600,
    quality = 0.8,
    maxBytes = 1_572_864,
  }: { maxSide?: number; quality?: number; maxBytes?: number } = {},
): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImageUnreadableError()
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new ImageUnreadableError()
  // A white page behind transparent parts (JPEG has no transparency).
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  for (let q = quality; q >= 0.5; q -= 0.1) {
    const webp = await toBlob(canvas, 'image/webp', q)
    const blob = webp?.type === 'image/webp' ? webp : await toBlob(canvas, 'image/jpeg', q)
    if (blob && blob.size <= maxBytes) return blob
  }
  throw new ImageTooLargeError()
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}
