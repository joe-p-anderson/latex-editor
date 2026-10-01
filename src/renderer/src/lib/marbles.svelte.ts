// Marbled sheets for the page: each is rendered once (in marble.worker.ts),
// kept on disk by the main process, and handed out as a blob URL. Until a
// sheet is ready, callers get a gradient of the palette's colours.
import { marblePlaceholder, type Marbling, type PaletteId, type Tone } from '@shared/appearance'
import { MARBLE_ENGINE_VERSION, SHEET_SIZES } from '@shared/marbling'
import { paletteTheme } from './appearance'
import type { MarbleRequest, MarbleResponse } from './marble.worker'

export type SheetSize = 'big' | 'small'
export interface Sheet {
  palette: PaletteId
  tone: Tone
  marbling: Marbling
  seed: number
}

// Ready sheets by key. Reading it in a template or $derived re-runs that when a sheet arrives.
const urls = $state<Record<string, string>>({})
const requested = new Set<string>()

const keyOf = (s: Sheet, size: SheetSize) => [`v${MARBLE_ENGINE_VERSION}`, s.palette, s.tone, s.marbling, s.seed, size].join('|')

/** The sheet's blob URL, or undefined while it's being made (it's requested on first ask). */
export function marbleUrl(sheet: Sheet, size: SheetSize = 'big'): string | undefined {
  const key = keyOf(sheet, size)
  const url = urls[key]
  if (!url && !requested.has(key)) {
    requested.add(key)
    // Not now: this may be running inside a template or $derived, which mustn't change state.
    queueMicrotask(() => load(key, sheet, size))
  }
  return url
}

/** A CSS background for the sheet: the image when it's ready, the palette's gradient until then. */
export function marbleCss(sheet: Sheet, size: SheetSize = 'big'): string {
  const url = marbleUrl(sheet, size)
  return url ? `url(${url})` : marblePlaceholder(paletteTheme(sheet.palette), sheet.tone)
}

/** Sheets still being marbled, for a quiet progress note. */
export const marbling = $state({ pending: 0 })

async function load(key: string, sheet: Sheet, size: SheetSize): Promise<void> {
  marbling.pending++
  try {
    let bytes = await window.api.marbleGet(key).catch(() => null)
    if (!bytes) {
      bytes = new Uint8Array(await render(sheet, size, size === 'big'))
      window.api.marblePut(key, bytes).catch(() => {})
    }
    urls[key] = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
  } catch {
    requested.delete(key) // try again next time it's asked for
  } finally {
    marbling.pending--
  }
}

// One worker, one sheet at a time; the big endpaper goes ahead of thumbnails.
let worker: Worker | null = null
let busy = false
let nextId = 0
const queue: { req: MarbleRequest; done: (bytes: ArrayBuffer) => void; fail: (e: Error) => void }[] = []

function render(sheet: Sheet, size: SheetSize, urgent: boolean): Promise<ArrayBuffer> {
  const [W, H] = size === 'big' ? SHEET_SIZES.big(sheet.marbling) : SHEET_SIZES.small()
  const mode = paletteTheme(sheet.palette).modes[sheet.tone === 'rich' ? 'dark' : 'light']
  const req: MarbleRequest = { id: ++nextId, pal: { marbling: mode.marbling, vein: mode.vein }, pattern: sheet.marbling, W, H, seed: sheet.seed }
  return new Promise((done, fail) => {
    const job = { req, done, fail }
    if (urgent) queue.unshift(job)
    else queue.push(job)
    pump()
  })
}

function pump(): void {
  if (busy || !queue.length) return
  const job = queue.shift()!
  busy = true
  worker ??= new Worker(new URL('./marble.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<MarbleResponse>) => {
    busy = false
    if ('bytes' in e.data) job.done(e.data.bytes)
    else job.fail(new Error(e.data.error))
    pump()
  }
  worker.onerror = (e) => {
    busy = false
    job.fail(new Error(e.message))
    pump()
  }
  worker.postMessage(job.req)
}
