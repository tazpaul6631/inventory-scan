import { CapacitorNfc } from '@capgo/capacitor-nfc'
import type { PluginListenerHandle } from '@capacitor/core'
import { hasWebNfc, isNative } from '@/adapters/platform'
import type { ScanResult } from '@/types'
import { i18n, trError } from '@/i18n'

let nativeHandle: PluginListenerHandle | null = null
let webAbort: AbortController | null = null

function bytesToText(bytes: number[] | undefined): string {
  if (!bytes?.length) return ''
  return new TextDecoder().decode(Uint8Array.from(bytes)).replace(/^\u0002?en/, '').trim()
}

function dataViewToText(view?: DataView): string {
  if (!view) return ''
  return new TextDecoder().decode(view).trim()
}

export async function startNfcScan(onResult: (result: ScanResult) => void): Promise<void> {
  await stopNfcScan()

  if (isNative()) {
    nativeHandle = await CapacitorNfc.addListener('nfcEvent', (event) => {
      const records = event.tag?.ndefMessage ?? []
      const payload = records.map((record) => bytesToText(record.payload)).filter(Boolean).join(' | ')
      const id = event.tag?.id ? event.tag.id.map((b) => b.toString(16).padStart(2, '0')).join(':') : ''
      const value = payload || id || JSON.stringify(event.tag ?? {})
      onResult({ value, format: event.tag?.type || event.type, kind: 'nfc' })
    })
    await CapacitorNfc.startScanning({
      alertMessage: String(i18n.global.t('scan.nfcAlert')),
      invalidateAfterFirstRead: false,
    })
    return
  }

  if (!hasWebNfc() || !window.NDEFReader) {
    throw new Error(trError('noNfc'))
  }

  webAbort = new AbortController()
  const reader = new window.NDEFReader()
  await reader.scan({ signal: webAbort.signal })
  reader.onreading = (event) => {
    const texts = event.message.records.map((record) => dataViewToText(record.data)).filter(Boolean)
    const value = texts.join(' | ') || event.serialNumber || 'NFC tag'
    onResult({ value, format: 'NDEF', kind: 'nfc' })
  }
}

export async function stopNfcScan(): Promise<void> {
  if (nativeHandle) {
    await nativeHandle.remove()
    nativeHandle = null
    try {
      await CapacitorNfc.stopScanning()
    } catch {
      // ignore
    }
  }
  webAbort?.abort()
  webAbort = null
}


