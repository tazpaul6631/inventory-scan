import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { deleteDiskFile, getFileUri, writeBinaryFile } from '@/storage/files'
import { createId } from '@/utils/id'

const MAX_EDGE = 1280
const JPEG_QUALITY = 0.5
export const EVIDENCE_MEDIA_KIND = 'scan_evidence'

export interface CapturedEvidence {
  id: string
  path: string
  size: number
  mime: string
  previewUrl: string
  vatNo: string
  cycleId: number
}

function sanitizePathPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'code'
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = src
  })
}

async function compressToJpegBlob(dataUrl: string): Promise<Blob> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('compress_failed')
  return blob
}

function toDataUrl(photo: { dataUrl?: string; base64String?: string; format?: string }): string {
  if (photo.dataUrl?.startsWith('data:')) return photo.dataUrl
  const raw = photo.base64String?.trim()
  if (!raw) throw new Error('empty_photo')
  const format = (photo.format || 'jpeg').replace(/^\./, '')
  return `data:image/${format};base64,${raw}`
}

/** Capture one compressed JPEG evidence photo for a vatNo. */
export async function captureEvidencePhoto(params: {
  cycleId: number
  vatNo: string
}): Promise<CapturedEvidence> {
  const vatNo = params.vatNo.trim()
  if (!vatNo) throw new Error('missing_vat_no')

  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.DataUrl,
    quality: 50,
    width: MAX_EDGE,
    correctOrientation: true,
  })

  const dataUrl = toDataUrl(photo)
  const blob = await compressToJpegBlob(dataUrl)
  const id = createId()
  const path = `evidence/${params.cycleId}/${sanitizePathPart(vatNo)}/${id}.jpg`
  await writeBinaryFile(path, blob)
  const previewUrl = await getFileUri(path)

  return {
    id,
    path,
    size: blob.size,
    mime: 'image/jpeg',
    previewUrl,
    vatNo,
    cycleId: params.cycleId,
  }
}

export async function discardEvidenceFile(path: string | null | undefined): Promise<void> {
  if (!path?.trim()) return
  try {
    await deleteDiskFile(path)
  } catch {
    // ignore missing temp file
  }
}
