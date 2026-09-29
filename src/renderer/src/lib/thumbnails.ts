// Thumbnail URLs for vault images. Raster and SVG images load straight from
// vault:// URLs; PDF figures (most figures in these vaults) have page 1
// rendered with PDF.js into a cached data URL. EPS can't be shown by a
// browser, so it gets null and callers show a placeholder.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { vaultUrl } from '@shared/images'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const cache = new Map<string, Promise<string | null>>()

/** A URL to show `rel` at up to `width` CSS pixels wide, or null if it can't be previewed. */
export function thumbnail(rel: string, width = 240): Promise<string | null> {
  const key = `${rel}@${width}`
  let hit = cache.get(key)
  if (!hit) {
    hit = make(rel, width).catch(() => null)
    cache.set(key, hit)
  }
  return hit
}

/** Forget cached thumbnails, e.g. after files change on disk. */
export function clearThumbnails(): void {
  cache.clear()
}

async function make(rel: string, width: number): Promise<string | null> {
  if (/\.eps$/i.test(rel)) return null
  if (!/\.pdf$/i.test(rel)) return vaultUrl(rel)
  const data = new Uint8Array(await (await fetch(vaultUrl(rel))).arrayBuffer())
  const task = pdfjs.getDocument({ data })
  try {
    const doc = await task.promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = (width * (window.devicePixelRatio || 1)) / base.width
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    return canvas.toDataURL('image/png')
  } finally {
    task.destroy()
  }
}
