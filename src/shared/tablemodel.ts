// The table editor's model: a tabular (optionally inside a table float)
// parsed into a grid that can be edited, and written back as clean source
// with the & columns lined up. Also turns spreadsheet clipboard data
// (Excel/Sheets TSV, or an HTML <table>) into cells.
//
// The grid is rows × columns of slots. A slot is a cell, or null where a
// \multicolumn cell to its left spans over it, so column operations never
// have to think about spans except at their edges.
import { closingBrace, envTokens, matchEnd } from './latexedit'

export type Align = 'l' | 'c' | 'r' | 'p' | 'm' | 'b' | 'X' | 'S'

export interface Column {
  align: Align
  /** p/m/b width, e.g. "3cm"; S options, e.g. "table-format=2.1". */
  arg?: string
  /** A >{...} before the column, kept as written. */
  pre?: string
  /** A <{...} after it. */
  post?: string
}

export interface Cell {
  tex: string
  span: number
  /** A \multicolumn's own column spec, e.g. "c" or "|c|". */
  spec?: string
}

export interface Row {
  cells: (Cell | null)[]
  /** Rule commands before the row, e.g. ["\\toprule"] or ["\\hline", "\\hline"]. */
  rules: string[]
  /** Spacing after the row's \\, e.g. "[2pt]". */
  gap?: string
  /**
   * How many cells the source wrote, when fewer than the columns (e.g. a
   * blank row left for handwritten data is just \\). Trailing empty cells
   * past this aren't written back.
   */
  written?: number
  /** The source's last row had no \\ after it. */
  open?: boolean
}

export type TableStyle = 'booktabs' | 'grid' | 'plain'

export interface TableFloat {
  env: string // table, table*
  placement: string // e.g. "htbp", '' for none
  caption: string | null
  label: string | null
  /** Caption after the tabular (LaTeX's default look is caption above for tables). */
  captionBelow: boolean
  centering: boolean
  /** Other lines in the float (e.g. \small), kept before the tabular. */
  extra: string[]
}

export interface TableModel {
  env: string // tabular, tabularx, tabular*
  /** Width argument of tabularx / tabular*. */
  width?: string
  /** Vertical position, e.g. "t", or ''. */
  pos: string
  cols: Column[]
  /** Separators between columns: seps[i] is left of column i ("|", "||", "@{}", ''); seps[cols.length] is the right edge. */
  seps: string[]
  rows: Row[]
  /** Rules after the last row. */
  rulesBelow: string[]
  float: TableFloat | null
}

// ---------------------------------------------------------------------------
// Parsing

/** Where the table at `pos` starts and ends: the table float if there is one, else the tabular. */
export function tableRangeAt(text: string, pos: number): { from: number; to: number } | null {
  const tokens = envTokens(text)
  let best: { from: number; to: number; float: boolean } | null = null
  for (const t of tokens) {
    if (t.kind !== 'begin' || t.from > pos || !/^(table\*?|tabularx?|tabular\*)$/.test(t.name)) continue
    const end = matchEnd(tokens, t)
    if (!end || end.to < pos) continue
    const float = t.name.startsWith('table') && !t.name.startsWith('tabular')
    // The outermost float wins over a tabular inside it.
    if (!best || (float && !best.float) || (float === best.float && t.from < best.from)) best = { from: t.from, to: end.to, float }
  }
  return best && { from: best.from, to: best.to }
}

/** A {…} group starting at `i` (after spaces): its content and where it ends. */
function group(text: string, i: number): { body: string; end: number } | null {
  while (/\s/.test(text[i] ?? '')) i++
  if (text[i] !== '{') return null
  const close = closingBrace(text, i)
  return close < 0 ? null : { body: text.slice(i + 1, close), end: close + 1 }
}

function optional(text: string, i: number): { body: string; end: number } | null {
  const m = /^\s*\[([^\]]*)\]/.exec(text.slice(i, i + 200))
  return m ? { body: m[1], end: i + m[0].length } : null
}

/** Parses a column spec into columns and the separators between them; null if it's beyond this parser. */
export function parseSpec(spec: string): { cols: Column[]; seps: string[] } | null {
  const s = expandStars(spec)
  const cols: Column[] = []
  const seps: string[] = ['']
  let pre: string | undefined
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (/\s/.test(c)) continue
    if (c === '|') {
      seps[cols.length] += '|'
      continue
    }
    if (c === '@' || c === '!' || c === '>' || c === '<') {
      const g = group(s, i + 1)
      if (!g) return null
      const raw = `${c}{${g.body}}`
      if (c === '>') pre = (pre ?? '') + raw
      else if (c === '<') {
        if (!cols.length) return null
        cols[cols.length - 1].post = (cols[cols.length - 1].post ?? '') + raw
      } else seps[cols.length] += raw
      i = g.end - 1
      continue
    }
    const col: Column = { align: c as Align }
    if (c === 'p' || c === 'm' || c === 'b') {
      const g = group(s, i + 1)
      if (!g) return null
      col.arg = g.body
      i = g.end - 1
    } else if (c === 'S') {
      const o = optional(s, i + 1)
      if (o) {
        col.arg = o.body
        i = o.end - 1
      }
    } else if (!'lcrX'.includes(c)) return null
    if (pre) col.pre = pre
    pre = undefined
    cols.push(col)
    seps.push('')
  }
  return cols.length ? { cols, seps } : null
}

function expandStars(spec: string): string {
  let s = spec
  for (let guard = 0; guard < 10; guard++) {
    const m = /\*\s*\{(\d+)\}\s*\{/.exec(s)
    if (!m) break
    const open = m.index + m[0].length - 1
    const close = closingBrace(s, open)
    if (close < 0) break
    s = s.slice(0, m.index) + s.slice(open + 1, close).repeat(Math.min(50, Number(m[1]))) + s.slice(close + 1)
  }
  return s
}

const RULE = /^\s*(\\(?:hline|toprule|midrule|bottomrule|addlinespace(?:\s*\[[^\]]*\])?|cline\s*\{[^}]*\}|cmidrule\s*(?:\([^)]*\))?\s*\{[^}]*\}))/

/** Splits at top-level `sep` (\\ or &), outside braces and environments. */
function splitTop(text: string, sep: '\\\\' | '&'): { text: string; gap?: string }[] {
  const out: { text: string; gap?: string }[] = []
  let depth = 0
  let env = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') {
      if (text.startsWith('\\begin', i)) env++
      else if (text.startsWith('\\end', i)) env--
      else if (sep === '\\\\' && text[i + 1] === '\\' && depth === 0 && env === 0) {
        const piece = text.slice(start, i)
        let j = i + 2
        if (text[j] === '*') j++
        const o = /^\s*\[[^\]]*\]/.exec(text.slice(j, j + 40))
        const gap = o ? o[0].trim() : undefined
        if (o) j += o[0].length
        out.push({ text: piece, gap })
        start = j
        i = j - 1
        continue
      }
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '&' && sep === '&' && depth === 0 && env === 0) {
      out.push({ text: text.slice(start, i) })
      start = i + 1
    }
  }
  out.push({ text: text.slice(start) })
  return out
}

/** Leading rule commands of a row, and the rest. */
function takeRules(text: string): { rules: string[]; rest: string } {
  const rules: string[] = []
  let rest = text
  for (let m = RULE.exec(rest); m; m = RULE.exec(rest)) {
    rules.push(m[1].replace(/\s+/g, ''))
    rest = rest.slice(m[0].length)
  }
  return { rules, rest }
}

/** An unescaped % anywhere: comments inside a table are left to the source view. */
const hasComment = (s: string) => /(^|[^\\])(\\\\)*%/.test(s)

/** The body rows of a tabular. */
function parseBody(body: string, ncols: number): { rows: Row[]; rulesBelow: string[] } | null {
  const rows: Row[] = []
  const pieces = splitTop(body, '\\\\')
  let rulesBelow: string[] = []
  for (const [k, piece] of pieces.entries()) {
    const { rules, rest } = takeRules(piece.text)
    if (!rest.trim()) {
      // Only rules (or nothing) after the last \\.
      if (k === pieces.length - 1) {
        rulesBelow = rules
        break
      }
      // Otherwise it's a blank row (\\ \\, a spacer): it stays one.
    }
    const cells: (Cell | null)[] = []
    for (const part of splitTop(rest, '&')) {
      const tex = part.text.trim()
      const mc = /^\\multicolumn\s*\{(\d+)\}\s*\{/.exec(tex)
      if (mc) {
        const specOpen = mc[0].length - 1
        const specClose = closingBrace(tex, specOpen)
        const content = specClose < 0 ? null : group(tex, specClose + 1)
        if (!content || tex.slice(content.end).trim()) return null
        const span = Math.max(1, Number(mc[1]))
        cells.push({ tex: content.body.trim(), span, spec: tex.slice(specOpen + 1, specClose) })
        for (let i = 1; i < span; i++) cells.push(null)
      } else cells.push({ tex, span: 1 })
    }
    if (cells.length > ncols) return null
    const written = cells.length < ncols ? cells.length : undefined
    while (cells.length < ncols) cells.push({ tex: '', span: 1 })
    const open = k === pieces.length - 1
    rows.push({ cells, rules, gap: piece.gap, ...(written !== undefined && { written }), ...(open && { open }) })
  }
  return { rows, rulesBelow }
}

/** Parses a tabular (or a table float holding one) from its source; null when it's beyond this editor. */
export function parseTable(src: string): TableModel | null {
  const text = src.replace(/\r\n/g, '\n')
  const tokens = envTokens(text)
  const first = tokens.find((t) => t.kind === 'begin')
  if (!first) return null
  const isFloat = /^table\*?$/.test(first.name)
  const tab = isFloat ? tokens.find((t) => t.kind === 'begin' && /^(tabularx?|tabular\*)$/.test(t.name)) : first
  if (!tab || !/^(tabularx?|tabular\*)$/.test(tab.name)) return null
  const tabEnd = matchEnd(tokens, tab)
  if (!tabEnd) return null
  // A second tabular in the same float is more than the dialog can show.
  if (isFloat && tokens.filter((t) => t.kind === 'begin' && /^tabular/.test(t.name)).length > 1) return null

  let j = tab.to
  let width: string | undefined
  if (tab.name !== 'tabular') {
    const w = group(text, j)
    if (!w) return null
    width = w.body
    j = w.end
  }
  const o = optional(text, j)
  const pos = o?.body ?? ''
  if (o) j = o.end
  const specGroup = group(text, j)
  if (!specGroup) return null
  const spec = parseSpec(specGroup.body)
  if (!spec) return null
  const body = text.slice(specGroup.end, tabEnd.from)
  if (hasComment(body)) return null
  const parsed = parseBody(body, spec.cols.length)
  if (!parsed) return null

  const model: TableModel = { env: tab.name, width, pos, cols: spec.cols, seps: spec.seps, rows: parsed.rows, rulesBelow: parsed.rulesBelow, float: null }
  if (isFloat) {
    const floatEnd = matchEnd(tokens, first)
    if (!floatEnd) return null
    model.float = parseFloat(text, first.name, first.to, tab.from, tabEnd.to, floatEnd.from)
    if (!model.float) return null
  }
  return model
}

function parseFloat(text: string, env: string, afterBegin: number, tabFrom: number, tabTo: number, endFrom: number): TableFloat | null {
  const p = optional(text, afterBegin)
  const placement = p?.body ?? ''
  const start = p?.end ?? afterBegin
  const before = text.slice(start, tabFrom)
  const after = text.slice(tabTo, endFrom)
  if (hasComment(before) || hasComment(after)) return null

  let caption: string | null = null
  let label: string | null = null
  let captionBelow = false
  let centering = false
  const extra: string[] = []
  // Pull the known commands out of each side; whatever is left is kept as extra lines.
  const take = (chunk: string, below: boolean) => {
    let rest = chunk
    const cap = /\\caption\s*(?:\[[^\]]*\])?\s*\{/.exec(rest)
    if (cap) {
      const open = cap.index + cap[0].length - 1
      const close = closingBrace(rest, open)
      if (close < 0) return false
      caption = rest.slice(open + 1, close)
      captionBelow = below
      rest = rest.slice(0, cap.index) + rest.slice(close + 1)
    }
    const lab = /\\label\s*\{([^}]*)\}/.exec(rest)
    if (lab) {
      label = lab[1]
      rest = rest.slice(0, lab.index) + rest.slice(lab.index + lab[0].length)
    }
    const cen = /\\centering\b/.exec(rest)
    if (cen) {
      centering = true
      rest = rest.slice(0, cen.index) + rest.slice(cen.index + cen[0].length)
    }
    for (const line of rest.split('\n')) if (line.trim()) extra.push(line.trim())
    return true
  }
  if (!take(before, false) || !take(after, true)) return null
  // A \begin{center} wrapper or anything else structural stays in the source view.
  if (extra.some((l) => /\\(begin|end)\s*\{/.test(l))) return null
  return { env, placement, caption, label, captionBelow, centering, extra }
}

// ---------------------------------------------------------------------------
// Writing

const specOf = (c: Column) =>
  (c.pre ?? '') + c.align + (c.align === 'S' ? (c.arg ? `[${c.arg}]` : '') : c.arg !== undefined ? `{${c.arg}}` : '') + (c.post ?? '')

export function specString(model: TableModel): string {
  return model.cols.map((c, i) => model.seps[i] + specOf(c)).join('') + model.seps[model.cols.length]
}

const NUMBER = /^[-+−]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/

/** An S column treats text as a number unless it's in braces. */
function cellSource(cell: Cell, col: Column | undefined): string {
  if (cell.span > 1) return `\\multicolumn{${cell.span}}{${cell.spec ?? 'c'}}{${cell.tex}}`
  const t = cell.tex
  if (col?.align === 'S' && t && !NUMBER.test(t.trim()) && !/^\{.*\}$/.test(t)) return `{${t}}`
  return t
}

/** Source for the table, lines indented from `indent`, with & aligned. */
export function serializeTable(model: TableModel, indent = '', unit = '    '): string {
  const inner = model.float ? indent + unit : indent
  const body = inner + unit
  const lines: string[] = []
  const head = `\\begin{${model.env}}${model.width !== undefined ? `{${model.width}}` : ''}${model.pos ? `[${model.pos}]` : ''}{${specString(model)}}`

  // Column widths for lining up the &s, from cells that span one column.
  const texts = model.rows.map((r) => r.cells.map((c, i) => (c ? cellSource(c, model.cols[i]) : null)))
  const widths = model.cols.map((_, i) => Math.max(0, ...model.rows.map((r, k) => (r.cells[i]?.span === 1 ? texts[k][i]!.length : 0))))

  lines.push(inner + head)
  for (const [k, row] of model.rows.entries()) {
    for (const rule of row.rules) lines.push(body + rule)
    const parts: string[] = []
    // A short row stays short, unless something was typed past its end.
    let end = row.cells.length
    if (row.written !== undefined) {
      end = row.written
      row.cells.forEach((c, i) => c?.tex && (end = Math.max(end, i + c.span)))
    }
    let col = 0
    while (col < end) {
      const cell = row.cells[col]
      if (!cell) {
        col++
        continue
      }
      const t = texts[k][col]!
      const last = col + cell.span >= end
      // Pad to the column's width so the next & lines up; spanning cells cover several columns.
      let width = 0
      for (let i = col; i < col + cell.span; i++) width += widths[i] + (i > col ? 3 : 0)
      parts.push(last ? t : t.padEnd(width))
      col += cell.span
    }
    const lastRow = k === model.rows.length - 1 && !model.rulesBelow.length
    const cells = parts.join(' & ').trimEnd()
    const brk = row.open && lastRow ? '' : '\\\\' + (row.gap ?? '')
    lines.push(body + (cells && brk ? `${cells} ${brk}` : cells + brk))
  }
  for (const rule of model.rulesBelow) lines.push(body + rule)
  lines.push(`${inner}\\end{${model.env}}`)

  if (!model.float) return lines.join('\n')
  const f = model.float
  const out = [`${indent}\\begin{${f.env}}${f.placement ? `[${f.placement}]` : ''}`]
  if (f.centering) out.push(inner + '\\centering')
  for (const e of f.extra) out.push(inner + e)
  const cap = [...(f.caption !== null ? [inner + `\\caption{${f.caption}}`] : []), ...(f.label ? [inner + `\\label{${f.label}}`] : [])]
  if (!f.captionBelow) out.push(...cap)
  out.push(...lines)
  if (f.captionBelow) out.push(...cap)
  out.push(`${indent}\\end{${f.env}}`)
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Building and editing

const emptyRow = (n: number): Row => ({ cells: Array.from({ length: n }, () => ({ tex: '', span: 1 })), rules: [] })

/** A new table: `grid` (rows of cell text) in a booktabs tabular inside a table float. */
export function newTable(grid: string[][], style: TableStyle = 'booktabs'): TableModel {
  const ncols = Math.max(1, ...grid.map((r) => r.length))
  const rows = grid.map((r) => ({ cells: Array.from({ length: ncols }, (_, i) => ({ tex: r[i] ?? '', span: 1 })), rules: [] as string[] }))
  const model: TableModel = {
    env: 'tabular',
    pos: '',
    cols: Array.from({ length: ncols }, (_, i) => ({ align: numericColumn(grid, i) ? 'r' : 'l' }) as Column),
    seps: Array.from({ length: ncols + 1 }, () => ''),
    rows: rows.length ? rows : [emptyRow(ncols)],
    rulesBelow: [],
    float: { env: 'table', placement: 'htbp', caption: '', label: 'tab:', captionBelow: false, centering: true, extra: [] },
  }
  return applyStyle(model, style)
}

/** The rule style in use, as far as it matches a preset. */
export function styleOf(model: TableModel): TableStyle {
  const rules = [...model.rows.flatMap((r) => r.rules), ...model.rulesBelow]
  if (rules.some((r) => /toprule|midrule|bottomrule/.test(r))) return 'booktabs'
  if (rules.some((r) => r === '\\hline') || model.seps.some((s) => s.includes('|'))) return 'grid'
  return 'plain'
}

/** Sets the rules (and vertical lines) to a preset. Booktabs: top, under the header, bottom. */
export function applyStyle(model: TableModel, style: TableStyle): TableModel {
  const clean = (r: string[]) => r.filter((x) => !/^\\(hline|toprule|midrule|bottomrule|cline|cmidrule)/.test(x))
  const rows = model.rows.map((r, i) => {
    const keep = clean(r.rules)
    if (style === 'booktabs') return { ...r, rules: i === 0 ? ['\\toprule', ...keep] : i === 1 ? ['\\midrule', ...keep] : keep }
    if (style === 'grid') return { ...r, rules: ['\\hline', ...keep] }
    return { ...r, rules: keep }
  })
  const below = clean(model.rulesBelow)
  const rulesBelow = style === 'booktabs' ? ['\\bottomrule', ...below] : style === 'grid' ? ['\\hline', ...below] : below
  const seps = model.seps.map((s) => (style === 'grid' ? s.replace(/\|/g, '') + '|' : s.replace(/\|/g, '')))
  return { ...model, rows, rulesBelow, seps }
}

/** Packages the table needs beyond the kernel. */
export function packagesFor(model: TableModel): string[] {
  const out = new Set<string>()
  const rules = [...model.rows.flatMap((r) => r.rules), ...model.rulesBelow]
  if (rules.some((r) => /toprule|midrule|bottomrule|cmidrule|addlinespace/.test(r))) out.add('booktabs')
  if (model.cols.some((c) => c.align === 'S')) out.add('siunitx')
  if (model.cols.some((c) => c.align === 'm' || c.align === 'b' || c.pre || c.post)) out.add('array')
  if (model.env === 'tabularx') out.add('tabularx')
  return [...out]
}

/** Every cell below the header (row 0) in column `col` is a number, or empty (and at least one is a number). */
export function numericColumn(grid: string[][], col: number): boolean {
  const vals = grid.slice(1).map((r) => (r[col] ?? '').trim()).filter(Boolean)
  return vals.length > 0 && vals.every((v) => NUMBER.test(v.replace(/[{}]/g, '')))
}

export const cellText = (model: TableModel) => model.rows.map((r) => r.cells.map((c) => c?.tex ?? ''))

export function insertRow(model: TableModel, at: number): TableModel {
  const rows = [...model.rows]
  rows.splice(at, 0, emptyRow(model.cols.length))
  return { ...model, rows }
}

export function deleteRow(model: TableModel, at: number): TableModel {
  if (model.rows.length <= 1) return model
  const rows = [...model.rows]
  const [gone] = rows.splice(at, 1)
  // Its rules stay where they were, on the row that moves up.
  if (rows[at]) rows[at] = { ...rows[at], rules: [...new Set([...gone.rules, ...rows[at].rules])] }
  else return { ...model, rows, rulesBelow: [...new Set([...gone.rules.filter((r) => r !== '\\toprule' && r !== '\\midrule'), ...model.rulesBelow])] }
  return { ...model, rows }
}

/** Swaps row `at` with its neighbour; the rules stay in place, the content moves. */
export function moveRow(model: TableModel, at: number, by: -1 | 1): TableModel {
  const to = at + by
  if (to < 0 || to >= model.rows.length) return model
  const rows = model.rows.map((r) => ({ ...r }))
  ;[rows[at].cells, rows[to].cells] = [rows[to].cells, rows[at].cells]
  ;[rows[at].gap, rows[to].gap] = [rows[to].gap, rows[at].gap]
  return { ...model, rows }
}

/** The cell covering slot `col` of `row`, and the column it starts in. */
function owner(row: Row, col: number): { cell: Cell; start: number } | null {
  for (let i = col; i >= 0; i--) {
    const c = row.cells[i]
    if (c) return i + c.span > col ? { cell: c, start: i } : null
  }
  return null
}

export function insertColumn(model: TableModel, at: number, align: Align = 'l'): TableModel {
  const rows = model.rows.map((r) => {
    const cells = r.cells.map((c) => c && { ...c })
    const o = at < cells.length ? owner({ ...r, cells }, at) : null
    if (o && o.start < at) {
      // Inside a spanning cell: it grows to cover the new column.
      o.cell.span++
      cells.splice(at, 0, null)
    } else cells.splice(at, 0, { tex: '', span: 1 })
    return { ...r, cells, ...(r.written !== undefined && at < r.written && { written: r.written + 1 }) }
  })
  const cols = [...model.cols]
  cols.splice(at, 0, { align })
  // The new boundary gets the same kind of line as the table's others (the
  // outer edges, which may carry @{} and the like, stay where they are).
  const interior = (model.cols.length > 1 ? model.seps[1] : model.seps[0]).replace(/[@!]\{[^}]*\}/g, '')
  const seps = [...model.seps]
  seps.splice(at === model.cols.length ? at : at + 1, 0, interior)
  return { ...model, rows, cols, seps }
}

export function deleteColumn(model: TableModel, at: number): TableModel {
  if (model.cols.length <= 1) return model
  const rows = model.rows.map((r) => {
    const cells = r.cells.map((c) => c && { ...c })
    const o = owner({ ...r, cells }, at)
    if (o && o.cell.span > 1) {
      o.cell.span--
      // The spanning cell keeps its text; the slot that goes is one it covered.
      if (o.start === at) {
        cells[at + 1] = o.cell
        cells.splice(at, 1)
      } else cells.splice(at, 1)
    } else cells.splice(at, 1)
    return { ...r, cells, ...(r.written !== undefined && at < r.written && { written: r.written - 1 }) }
  })
  const cols = model.cols.filter((_, i) => i !== at)
  const seps = [...model.seps]
  seps.splice(at === model.cols.length - 1 ? at : at + 1, 1)
  return { ...model, rows, cols, seps }
}

export function moveColumn(model: TableModel, at: number, by: -1 | 1): TableModel {
  const to = at + by
  if (to < 0 || to >= model.cols.length) return model
  // Spans across the pair would tear; leave those tables alone.
  if (model.rows.some((r) => !r.cells[at] || !r.cells[to] || r.cells[at]!.span > 1 || r.cells[to]!.span > 1)) return model
  const swap = <T>(a: T[]) => {
    const b = [...a]
    ;[b[at], b[to]] = [b[to], b[at]]
    return b
  }
  return { ...model, cols: swap(model.cols), rows: model.rows.map((r) => ({ ...r, cells: swap(r.cells) })) }
}

/** Merges columns `from`..`to` of `row` into one \multicolumn cell (their text joined). */
export function mergeCells(model: TableModel, row: number, from: number, to: number): TableModel {
  const r = model.rows[row]
  const a = owner(r, from)
  const b = owner(r, to)
  if (!a || !b) return model
  const start = a.start
  const end = b.start + b.cell.span - 1
  if (end <= start) return model
  const cells = [...r.cells]
  const parts: string[] = []
  for (let i = start; i <= end; i++) {
    if (cells[i]?.tex.trim()) parts.push(cells[i]!.tex.trim())
    cells[i] = null
  }
  const align = model.cols[start].align
  cells[start] = { tex: parts.join(' '), span: end - start + 1, spec: 'lcr'.includes(align) ? align : 'c' }
  const rows = [...model.rows]
  rows[row] = { ...r, cells }
  return { ...model, rows }
}

/** Splits the spanning cell at `col` of `row` back into single cells (the text stays in the first). */
export function splitCell(model: TableModel, row: number, col: number): TableModel {
  const r = model.rows[row]
  const o = owner(r, col)
  if (!o || o.cell.span === 1) return model
  const cells = [...r.cells]
  cells[o.start] = { tex: o.cell.tex, span: 1 }
  for (let i = o.start + 1; i < o.start + o.cell.span; i++) cells[i] = { tex: '', span: 1 }
  const rows = [...model.rows]
  rows[row] = { ...r, cells }
  return { ...model, rows }
}

export function setCell(model: TableModel, row: number, col: number, tex: string): TableModel {
  const cell = model.rows[row]?.cells[col]
  if (!cell) return model
  const rows = [...model.rows]
  const cells = [...rows[row].cells]
  cells[col] = { ...cell, tex }
  rows[row] = { ...rows[row], cells }
  return { ...model, rows }
}

/** Pastes `grid` with its top-left at (row, col), adding rows and columns as needed. */
export function pasteGrid(model: TableModel, row: number, col: number, grid: string[][]): TableModel {
  let m = model
  const needCols = col + Math.max(0, ...grid.map((r) => r.length))
  while (m.cols.length < needCols) m = insertColumn(m, m.cols.length)
  while (m.rows.length < row + grid.length) m = insertRow(m, m.rows.length)
  for (const [i, r] of grid.entries()) {
    for (const [j, tex] of r.entries()) {
      const slot = m.rows[row + i].cells[col + j]
      if (slot) m = setCell(m, row + i, col + j, tex)
    }
  }
  return m
}

// ---------------------------------------------------------------------------
// Clipboard

const LATEX_SPECIAL: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
}

/** Plain text made safe for LaTeX: & % $ # _ { } ~ ^ \ escaped. */
export const escapeLatex = (s: string) => s.replace(/[\\&%$#_{}~^]/g, (c) => LATEX_SPECIAL[c])

/**
 * Tab-separated rows as Excel and Google Sheets copy them: a field in
 * double quotes may hold tabs, newlines and "" for a quote.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let i = 0
  const src = text.replace(/\r\n?/g, '\n')
  while (i < src.length) {
    if (field === '' && src[i] === '"') {
      // Quoted field.
      i++
      while (i < src.length) {
        if (src[i] === '"' && src[i + 1] === '"') {
          field += '"'
          i += 2
        } else if (src[i] === '"') {
          i++
          break
        } else field += src[i++]
      }
      continue
    }
    const c = src[i++]
    if (c === '\t') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (all, n: string) => ENTITIES[n.toLowerCase()] ?? all)

/** The first <table> in HTML as rows of cell text; a colspan repeats as empty cells after the text. */
export function parseHtmlTable(html: string): string[][] | null {
  const table = /<table[\s\S]*?<\/table>/i.exec(html)
  if (!table) return null
  const rows: string[][] = []
  for (const tr of table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row: string[] = []
    for (const td of tr[1].matchAll(/<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      const text = decode(td[3].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
      row.push(text)
      const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(td[2])?.[1] ?? 1)
      for (let k = 1; k < span; k++) row.push('')
    }
    if (row.length) rows.push(row)
  }
  return rows.length ? rows : null
}

/**
 * Clipboard contents that look like table data: HTML with a <table>, or
 * text with tabs on at least two lines (one line with tabs counts too, if
 * it has several cells). Cells are escaped for LaTeX unless `raw`.
 */
export function clipboardGrid(plain: string, html: string, raw = false): string[][] | null {
  let grid: string[][] | null = null
  const tsv = plain.includes('\t') ? parseTsv(plain) : null
  if (tsv && (tsv.length >= 2 || (tsv[0]?.length ?? 0) >= 2)) grid = tsv
  else if (html) grid = parseHtmlTable(html)
  if (!grid || (grid.length < 2 && (grid[0]?.length ?? 0) < 2)) return null
  // Excel adds a trailing empty row; ragged rows are padded.
  while (grid.length > 1 && grid[grid.length - 1].every((c) => !c.trim())) grid.pop()
  const width = Math.max(...grid.map((r) => r.length))
  return grid.map((r) => Array.from({ length: width }, (_, i) => (raw ? (r[i] ?? '').trim() : escapeLatex((r[i] ?? '').trim()))))
}
