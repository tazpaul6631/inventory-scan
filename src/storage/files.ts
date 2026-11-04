import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import writeBlob from 'capacitor-blob-writer'
import { trError } from '@/i18n'

const DATA_DIR = Directory.Data
const DOCS_DIR = Directory.Documents
const IDB_NAME = 'inventory-scan-fs'
const IDB_STORE = 'files'

function canUseOpfs(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error(trError('invalidPath')))
  })
}

async function idbPut(path: string, blob: Blob): Promise<void> {
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(blob, path)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error(trError('invalidPath')))
  })
  db.close()
}

async function idbGet(path: string): Promise<Blob | null> {
  const db = await openIdb()
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(path)
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
    req.onerror = () => reject(req.error ?? new Error(trError('invalidPath')))
  })
  db.close()
  return blob
}

async function idbDelete(path: string): Promise<void> {
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(path)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error(trError('invalidPath')))
  })
  db.close()
}

async function getOpfsHandle(path: string, create: boolean) {
  if (!canUseOpfs()) throw new Error(trError('invalidPath'))
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  if (!name) throw new Error(trError('invalidPath'))
  let dir = await navigator.storage.getDirectory()
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create })
  }
  return dir.getFileHandle(name, { create })
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export async function writeTextFile(
  path: string,
  content: string,
  directory: 'data' | 'documents' = 'data',
): Promise<void> {
  if (isNative()) {
    await Filesystem.writeFile({
      path,
      data: content,
      directory: directory === 'documents' ? DOCS_DIR : DATA_DIR,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    return
  }

  if (directory === 'documents') {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').pop() || 'backup.json'
    a.click()
    URL.revokeObjectURL(url)
    return
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  if (canUseOpfs()) {
    const handle = await getOpfsHandle(path, true)
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    return
  }
  await idbPut(path, blob)
}

export async function writeBinaryFile(path: string, data: Blob | Uint8Array): Promise<void> {
  const blob =
    data instanceof Blob ? data : new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })

  if (isNative()) {
    try {
      await writeBlob({
        path,
        directory: DATA_DIR,
        blob,
        recursive: true,
        fast_mode: false,
      })
      return
    } catch {
      await Filesystem.writeFile({
        path,
        data: await blobToBase64(blob),
        directory: DATA_DIR,
        recursive: true,
      })
    }
    return
  }

  if (canUseOpfs()) {
    const handle = await getOpfsHandle(path, true)
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }
  await idbPut(path, blob)
}

export async function readTextFile(path: string, directory: 'data' | 'documents' = 'data'): Promise<string> {
  if (isNative()) {
    const result = await Filesystem.readFile({
      path,
      directory: directory === 'documents' ? DOCS_DIR : DATA_DIR,
      encoding: Encoding.UTF8,
    })
    return String(result.data)
  }

  if (canUseOpfs()) {
    const handle = await getOpfsHandle(path, false)
    const file = await handle.getFile()
    return file.text()
  }
  const blob = await idbGet(path)
  if (!blob) throw new Error(trError('invalidPath'))
  return blob.text()
}

export async function readBinaryFile(path: string): Promise<Blob> {
  if (isNative()) {
    const result = await Filesystem.readFile({
      path,
      directory: DATA_DIR,
    })
    const base64 = String(result.data)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes])
  }

  if (canUseOpfs()) {
    const handle = await getOpfsHandle(path, false)
    return handle.getFile()
  }
  const blob = await idbGet(path)
  if (!blob) throw new Error(trError('invalidPath'))
  return blob
}

export async function deleteDiskFile(path: string): Promise<void> {
  if (isNative()) {
    await Filesystem.deleteFile({ path, directory: DATA_DIR })
    return
  }
  if (canUseOpfs()) {
    try {
      const parts = path.split('/').filter(Boolean)
      const name = parts.pop()
      if (!name) return
      let dir = await navigator.storage.getDirectory()
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part)
      }
      await dir.removeEntry(name)
    } catch {
      // ignore missing file
    }
    return
  }
  try {
    await idbDelete(path)
  } catch {
    // ignore missing file
  }
}

export async function getFileUri(path: string): Promise<string> {
  if (isNative()) {
    const { uri } = await Filesystem.getUri({ path, directory: DATA_DIR })
    return Capacitor.convertFileSrc(uri)
  }
  const blob = await readBinaryFile(path)
  return URL.createObjectURL(blob)
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    if (isNative()) {
      await Filesystem.stat({ path, directory: DATA_DIR })
      return true
    }
    if (canUseOpfs()) {
      await getOpfsHandle(path, false)
      return true
    }
    return (await idbGet(path)) != null
  } catch {
    return false
  }
}

export async function persistFlag(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}
