const MAX_EDGE = 1600
const TARGET_BYTES = 900 * 1024
const QUALITIES = [0.8, 0.65, 0.5, 0.35]

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo'))
    reader.readAsDataURL(blob)
  })

export interface CompressedPhoto {
  dataUrl: string
  bytes: number
}

/** Shrinks a camera photo to a JPEG small enough to wait in the outbox and upload on a weak signal. */
export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not process the photo')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let smallest: Blob | null = null
  for (const quality of QUALITIES) {
    smallest = await toBlob(canvas, quality)
    if (smallest && smallest.size <= TARGET_BYTES) break
  }
  if (!smallest) throw new Error('Could not process the photo')
  return { dataUrl: await toDataUrl(smallest), bytes: smallest.size }
}
