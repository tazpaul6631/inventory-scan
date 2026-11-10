import { Capacitor } from '@capacitor/core'
import { Html5Qrcode } from 'html5-qrcode'
import { isNative } from '@/adapters/platform'
import type { ScanResult } from '@/types'
import { trError } from '@/i18n'

let html5: Html5Qrcode | null = null
/** After ML Kit/GMS unavailable or failed once, skip straight to html5 live scan. */
let skipMlKit = false

type MlKit = typeof import('@capacitor-mlkit/barcode-scanning')

function loadMlKit(): Promise<MlKit> {
  return import('@capacitor-mlkit/barcode-scanning')
}

export function isScanCanceled(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /cancel/i.test(message)
}

/** True when this device should open html5 overlay without trying ML Kit first. */
export function preferLiveScan(): boolean {
  return skipMlKit || !isNative()
}

function markSkipMlKit(): void {
  skipMlKit = true
}

/** After camera/ML Kit issues, always use html5 live scan on later attempts. */
export function forcePreferLiveScan(): void {
  markSkipMlKit()
}

async function requestCameraPermission(ml: MlKit): Promise<void> {
  const { camera } = await ml.BarcodeScanner.requestPermissions()
  if (camera !== 'granted' && camera !== 'limited') {
    throw new Error(trError('cameraPermission'))
  }
}

/**
 * Google Code Scanner only — no module install wait.
 * If unsupported / module missing, fail immediately so UI opens html5.
 */
export async function scanBarcodeNative(): Promise<ScanResult> {
  if (skipMlKit) throw new Error(trError('useLiveScan'))

  const ml = await loadMlKit()
  const { BarcodeScanner, BarcodeFormat } = ml

  try {
    const { supported } = await BarcodeScanner.isSupported()
    if (!supported) {
      markSkipMlKit()
      throw new Error(trError('useLiveScan'))
    }

    if (Capacitor.getPlatform() === 'android') {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
      if (!available) {
        // Do not installGoogleBarcodeScannerModule() — that can hang ~60s on weak/no-GMS phones.
        markSkipMlKit()
        throw new Error(trError('useLiveScan'))
      }
    }

    await requestCameraPermission(ml)

    const { barcodes } = await BarcodeScanner.scan({
      formats: [
        BarcodeFormat.QrCode,
        BarcodeFormat.Code128,
        BarcodeFormat.Code39,
        BarcodeFormat.Code93,
        BarcodeFormat.Ean13,
        BarcodeFormat.Ean8,
        BarcodeFormat.UpcA,
        BarcodeFormat.UpcE,
        BarcodeFormat.DataMatrix,
        BarcodeFormat.Aztec,
      ],
      autoZoom: true,
    })
    const first = barcodes[0]
    const value = first?.rawValue?.trim()
    if (!value) throw new Error(trError('scanEmpty'))
    const format = String(first.format ?? '')
    const kind = format.toLowerCase().includes('qr') ? 'qr' : 'barcode'
    return { value, format, kind }
  } catch (err) {
    if (!isScanCanceled(err)) markSkipMlKit()
    throw err
  }
}

export async function scanOnce(): Promise<ScanResult> {
  if (isNative()) return scanBarcodeNative()
  throw new Error(trError('useLiveScan'))
}

let liveScanAbort: (() => void) | null = null

/** Single-shot live camera decode via WebView (works without Google Barcode Module). */
export async function scanOnceLive(elementId: string): Promise<ScanResult> {
  await stopLiveScan()
  return new Promise((resolve, reject) => {
    liveScanAbort = () => {
      liveScanAbort = null
      void stopLiveScan()
        .catch(() => undefined)
        .finally(() => reject(new Error('canceled')))
    }
    void startLiveScan(elementId, (result) => {
      liveScanAbort = null
      void stopLiveScan()
        .catch(() => undefined)
        .finally(() => resolve(result))
    }).catch((err) => {
      liveScanAbort = null
      reject(err)
    })
  })
}

/** Cancel an in-flight scanOnceLive (user closed overlay). */
export async function cancelLiveScan(): Promise<void> {
  if (liveScanAbort) {
    liveScanAbort()
    return
  }
  await stopLiveScan()
}

export async function startLiveScan(
  elementId: string,
  onResult: (result: ScanResult) => void,
): Promise<void> {
  await stopLiveScan()
  html5 = new Html5Qrcode(elementId)
  await html5.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 260, height: 260 } },
    (decoded) => {
      onResult({
        value: decoded,
        format: 'LIVE',
        kind: decoded.length > 20 ? 'qr' : 'barcode',
      })
    },
    () => undefined,
  )
}

export async function stopLiveScan(): Promise<void> {
  if (!html5) return
  try {
    if (html5.isScanning) await html5.stop()
    html5.clear()
  } catch {
    // ignore
  }
  html5 = null
}

export function canNativeScan(): boolean {
  return isNative()
}
