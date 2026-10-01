// Marbles sheets off the main thread (see @shared/marbling) and encodes
// them as JPEG for the disk cache. A big sheet takes a few seconds.
import type { Marbling } from '@shared/appearance'
import { renderMarble, type MarblePalette } from '@shared/marbling'

export type MarbleRequest = { id: number; pal: MarblePalette; pattern: Marbling; W: number; H: number; seed: number }
export type MarbleResponse = { id: number; bytes: ArrayBuffer } | { id: number; error: string }

self.onmessage = async (e: MessageEvent<MarbleRequest>) => {
  const { id, pal, pattern, W, H, seed } = e.data
  try {
    const canvas = new OffscreenCanvas(W, H)
    canvas.getContext('2d')!.putImageData(new ImageData(renderMarble(pal, pattern, W, H, seed) as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0)
    const bytes = await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer()
    self.postMessage({ id, bytes } satisfies MarbleResponse, { transfer: [bytes] })
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message } satisfies MarbleResponse)
  }
}
