// SyncTeX: mapping between source lines and positions in the PDF.
//
// Reads the .synctex.gz that pdflatex writes next to the PDF, in-process.
// MiKTeX's `synctex` command-line tool gives the same answers, but costs
// ~600 ms of process start-up per call, which is too slow for a jump.
//
// Format (pdfTeX, SyncTeX version 1), one record per line:
//   Input:<tag>:<path>               source file table (can appear anywhere)
//   {<page>  ...  }<page>            a PDF page
//   [ ( v h  tag,line:h,v:W,H,D      vbox/hbox open, void vbox/hbox
//   ] )                              vbox/hbox close
//   x g $    tag,line:h,v            current position, glue, math
//   k        tag,line:h,v:W          kern
//   r        tag,line:h,v:W,H,D      rule
// Coordinates are in scaled points (sp) from the page's top-left corner,
// already including TeX's 1in offset; 65781.76 sp = 1 PDF point (bp).
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const SP_PER_BP = 65781.76

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface HBox {
  tag: number
  line: number
  page: number
  left: number
  top: number
  right: number
  bottom: number
  /** Index of the enclosing hbox, or -1. */
  parent: number
}

interface Point {
  tag: number
  line: number
  page: number
  x: number
  y: number
  /** Index into `boxes` of the innermost enclosing hbox, or -1. */
  box: number
}

interface SyncData {
  /** tag → absolute path as pdflatex recorded it. */
  inputs: Map<number, string>
  /** tag → the same path normalised for comparison (lower-cased on Windows). */
  keys: Map<number, string>
  boxes: HBox[]
  points: Point[]
}

const RECORD = /^([[(vhxgk$r])(\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/

const normPath = (p: string) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))

export function parse(text: string): SyncData {
  let unit = 1
  let mag = 1
  let xOff = 0
  let yOff = 0
  const inputs = new Map<number, string>()
  const keys = new Map<number, string>()
  const boxes: HBox[] = []
  const points: Point[] = []
  const stack: number[] = [] // open boxes: hbox index, or -1 for a vbox
  let page = 0

  const bp = (sp: number) => (sp * unit * mag) / SP_PER_BP

  for (const line of text.split('\n')) {
    const c = line[0]
    if (c === '{') {
      page = Number(line.slice(1))
      stack.length = 0
      continue
    }
    if (c === ']' || c === ')') {
      stack.pop()
      continue
    }
    const m = RECORD.exec(line)
    if (m) {
      const [, type, tag, ln, h, v, w, hh, d] = m
      const x = bp(Number(h)) + xOff
      const y = bp(Number(v)) + yOff
      let parent = -1
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i] >= 0) { parent = stack[i]; break }
      if (type === '(' || type === 'h') {
        const i = boxes.length
        boxes.push({
          parent,
          tag: Number(tag), line: Number(ln), page,
          left: x, right: x + bp(Number(w ?? 0)),
          top: y - bp(Number(hh ?? 0)), bottom: y + bp(Number(d ?? 0)),
        })
        if (type === '(') stack.push(i)
      } else if (type === '[') {
        stack.push(-1)
      } else if (type !== 'v') {
        // Point-like records: position in the text, which is what makes
        // inverse search land on the right line within a paragraph.
        points.push({ tag: Number(tag), line: Number(ln), page, x, y, box: parent })
      }
      continue
    }
    if (line.startsWith('Input:')) {
      const sep = line.indexOf(':', 6)
      const tag = Number(line.slice(6, sep))
      const path = line.slice(sep + 1).trimEnd()
      inputs.set(tag, path)
      keys.set(tag, normPath(path))
    } else if (line.startsWith('Unit:')) unit = Number(line.slice(5))
    else if (line.startsWith('Magnification:')) mag = Number(line.slice(14)) / 1000
    else if (line.startsWith('X Offset:')) xOff = Number(line.slice(9)) / SP_PER_BP
    else if (line.startsWith('Y Offset:')) yOff = Number(line.slice(9)) / SP_PER_BP
  }
  return { inputs, keys, boxes, points }
}

// Parsed files, reused until pdflatex rewrites them.
const cache = new Map<string, { mtime: number; data: SyncData }>()

async function load(pdf: string): Promise<SyncData | null> {
  const file = pdf.replace(/\.pdf$/i, '.synctex.gz')
  const s = await stat(file).catch(() => null)
  if (!s) return null
  const hit = cache.get(file)
  if (hit && hit.mtime === s.mtimeMs) return hit.data
  const data = parse(gunzipSync(await readFile(file)).toString('utf8'))
  cache.set(file, { mtime: s.mtimeMs, data })
  return data
}

/**
 * Source → PDF. Returns the page and highlight rectangles (in PDF points)
 * for `line` of `texAbs`. A line that produced no output (blank, comment,
 * \begin{...}) falls back to the nearest line that did, preferring later ones.
 */
export async function forward(pdf: string, texAbs: string, line: number): Promise<{ page: number; rects: Rect[] } | null> {
  const data = await load(pdf)
  if (!data) return null
  const want = normPath(texAbs)
  const tags = new Set([...data.keys].filter(([, p]) => p === want).map(([t]) => t))
  if (tags.size === 0) return null

  for (let k = 0; k <= 30; k++) {
    for (const candidate of k === 0 ? [line] : [line + k, line - k]) {
      const hit = rectsFor(data, tags, candidate)
      if (hit) return hit
    }
  }
  return null
}

function rectsFor(data: SyncData, tags: Set<number>, line: number): { page: number; rects: Rect[] } | null {
  const matches = (r: { tag: number; line: number }) => r.line === line && tags.has(r.tag)
  const pts = data.points.filter(matches)
  const bxs = data.boxes.filter((b) => matches(b) && b.right > b.left)
  const page = Math.min(...pts.map((p) => p.page), ...bxs.map((b) => b.page))
  if (!Number.isFinite(page)) return null

  // One rectangle per output line: the span of this source line's positions
  // within each enclosing hbox, using that box's height.
  const spans = new Map<number, { left: number; right: number }>()
  for (const p of pts) {
    if (p.page !== page || p.box < 0) continue
    const s = spans.get(p.box)
    if (s) { s.left = Math.min(s.left, p.x); s.right = Math.max(s.right, p.x) }
    else spans.set(p.box, { left: p.x, right: p.x })
  }
  const rects: Rect[] = []
  for (const [i, s] of spans) {
    const b = data.boxes[i]
    // A single position has no width; show the rest of the line from there.
    const right = s.right - s.left < 2 ? b.right : s.right
    rects.push({ x: s.left, y: b.top, w: Math.max(right - s.left, 4), h: b.bottom - b.top })
  }
  // Boxes started by this line (figures, \includegraphics, tables) count whole,
  // unless they are page-sized containers.
  for (const b of bxs) {
    if (b.page !== page || b.bottom - b.top > 400) continue
    rects.push({ x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top })
  }
  const visible = rects.filter((r) => r.h >= 1) // empty header/footer boxes have no height
  return visible.length ? { page, rects: mergeRects(visible) } : null
}

/** Drops rectangles wholly inside another, so nested boxes don't stack up. */
function mergeRects(rects: Rect[]): Rect[] {
  const inside = (a: Rect, b: Rect) =>
    a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5
  // Two near-identical rectangles each lie inside the other; keep the first.
  return rects.filter((r, i) => !rects.some((o, j) => j !== i && inside(r, o) && (!inside(o, r) || j < i)))
}

/**
 * PDF → source. (x, y) is in PDF points from the page's top-left. Finds the
 * smallest hbox under the point, then the nearest text position or child box
 * inside it, so a click lands on the right line even within a paragraph.
 * Round-tripped over every content line of the fixtures, this matches or
 * beats MiKTeX's `synctex edit` (see spikes/README.md).
 */
export async function inverse(pdf: string, page: number, x: number, y: number): Promise<{ file: string; line: number } | null> {
  const data = await load(pdf)
  if (!data) return null

  let best = -1
  let bestArea = Infinity
  data.boxes.forEach((b, i) => {
    if (b.page !== page || x < b.left || x > b.right || y < b.top || y > b.bottom) return
    const area = (b.right - b.left) * (b.bottom - b.top)
    if (area > 0 && area < bestArea) { best = i; bestArea = area }
  })

  // Candidates are the text positions and hboxes directly inside the chosen
  // box, or, when the click hit no box at all (blank space under an image,
  // margins), everything on the page. The nearest one wins, so a click in
  // the gap below a figure still lands on its \includegraphics line.
  const inside = (i: number) => (best >= 0 ? i === best : true)
  const pointDist = (p: Point) => Math.hypot(p.x - x, p.y - y)
  const boxDist = (b: HBox) =>
    Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom))
  let pick: { tag: number; line: number; d: number } | null = null
  for (const p of data.points) {
    if (p.page !== page || p.box < 0 || !inside(p.box)) continue
    const d = pointDist(p)
    if (!pick || d < pick.d) pick = { tag: p.tag, line: p.line, d }
  }
  for (const b of data.boxes) {
    if (b.page !== page || b.right <= b.left || b.bottom <= b.top) continue
    if (best >= 0 ? b.parent !== best : b.bottom - b.top > 400) continue // skip page-sized containers
    const d = boxDist(b)
    if (!pick || d < pick.d) pick = { tag: b.tag, line: b.line, d }
  }
  if (!pick && best >= 0) pick = { ...data.boxes[best], d: 0 }
  if (!pick) return null
  const { tag, line } = pick

  const file = data.inputs.get(tag)
  return file ? { file, line } : null
}
