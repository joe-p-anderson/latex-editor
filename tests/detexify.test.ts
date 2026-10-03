import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { Classifier, greedyDtw, preprocess, type SampleData, type Stroke } from '../src/shared/detexify'

const ASSETS = resolve(import.meta.dirname, '../src/plugins/symbols/ui/assets')
let data: SampleData
let classifier: Classifier
const symbols = JSON.parse(readFileSync(resolve(ASSETS, 'symbols.json'), 'utf8')) as { id: string; command: string }[]
const commandOf = (id: string) => symbols.find((s) => s.id === id)?.command

beforeAll(() => {
  data = JSON.parse(gunzipSync(readFileSync(resolve(ASSETS, 'samples.json.gz'))).toString())
  classifier = new Classifier(data)
}, 30_000)

/** A sample as the strokes someone drew (screen coordinates, y down). */
const asDrawing = (sample: number[][]): Stroke[] =>
  sample.map((flat) => {
    const pts: Stroke = []
    for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i] * 3 + 40, y: flat[i + 1] * 3 + 25 })
    return pts
  })

describe('Detexify classifier', () => {
  it('has every symbol in the library', () => {
    expect(classifier.symbolCount).toBe(symbols.length)
  })

  it('recognises its own samples, drawn at another size and place', () => {
    const ids = Object.keys(data).filter((id) => data[id].length >= 3)
    let top5 = 0
    const tried = 60
    for (let k = 0; k < tried; k++) {
      const id = ids[Math.floor((k * ids.length) / tried)]
      const results = classifier.classify(asDrawing(data[id][1]), 5).map((r) => r.id)
      if (results.includes(id)) top5++
    }
    // Detexify Next's own classifier scores the same 42/60 here: many symbols
    // look alike (|, \mid, \textbar). This guards against the port drifting.
    expect(top5 / tried).toBeGreaterThanOrEqual(0.68)
  })

  it('finds a hand-drawn circle among circle-like symbols', () => {
    const circle: Stroke = Array.from({ length: 40 }, (_, i) => ({ x: 100 + 50 * Math.cos((i / 39) * 2 * Math.PI), y: 100 + 50 * Math.sin((i / 39) * 2 * Math.PI) }))
    const commands = classifier.classify([circle], 10).map((r) => commandOf(r.id))
    expect(commands.some((c) => /circ|\\bigcirc|\\ocircle|\\Circle|o$|\\degree/.test(c ?? ''))).toBe(true)
  })

  it('is quick enough to run while drawing', () => {
    const t = performance.now()
    classifier.classify(asDrawing(data[Object.keys(data)[200]][0]), 30)
    expect(performance.now() - t).toBeLessThan(500)
  })

  it('handles degenerate input', () => {
    expect(classifier.classify([])).toEqual([])
    expect(classifier.classify([[{ x: 5, y: 5 }]]).length).toBeGreaterThan(0)
    expect(preprocess([[{ x: 1, y: 1 }, { x: 1, y: 1 }]])).toEqual([{ x: 0.5, y: 0.5 }])
    expect(greedyDtw([0, 0], [0, 0, 1, 1])).toBeCloseTo(1)
  })
})
