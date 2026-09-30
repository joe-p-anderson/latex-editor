// Recognises drawn symbols off the main thread (see @shared/detexify). The
// handwriting samples are bundled with the worker (gzipped, inlined as a
// data URL: the page runs from file://, where fetch() can't load files) and
// unpacked the first time a drawing arrives.
import { Classifier, type Stroke } from '@shared/detexify'
import samplesUrl from '../assets/detexify/samples.json.gz?inline'

export type WorkerRequest = { seq: number; strokes: Stroke[]; limit: number }
export type WorkerResponse = { seq: number; results: { id: string; score: number }[] } | { seq: number; error: string }

let classifier: Promise<Classifier> | null = null

async function load(): Promise<Classifier> {
  const base64 = samplesUrl.slice(samplesUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
  return new Classifier(JSON.parse(text))
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { seq, strokes, limit } = e.data
  try {
    const c = await (classifier ??= load())
    self.postMessage({ seq, results: c.classify(strokes, limit) } satisfies WorkerResponse)
  } catch (err) {
    self.postMessage({ seq, error: (err as Error).message } satisfies WorkerResponse)
  }
}
