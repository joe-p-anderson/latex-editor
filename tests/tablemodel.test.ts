import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyStyle,
  clipboardGrid,
  deleteColumn,
  escapeLatex,
  insertColumn,
  mergeCells,
  moveColumn,
  newTable,
  packagesFor,
  parseHtmlTable,
  parseTable,
  parseTsv,
  pasteGrid,
  serializeTable,
  specString,
  splitCell,
  styleOf,
  tableRangeAt,
} from '../src/shared/tablemodel'

const squash = (s: string) => s.replace(/\s+/g, '')

function texFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return /^(\.texcache|pdf)$/.test(n) ? [] : texFiles(p)
    return n.endsWith('.tex') ? [p] : []
  })
}

describe('fixture tables', () => {
  const files = texFiles(resolve(import.meta.dirname, '../fixtures/vaults'))
  const tables = files.flatMap((f) => {
    const text = readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
    const out: { file: string; src: string }[] = []
    for (const m of text.matchAll(/\\begin\{(table\*?|tabularx?|tabular\*)\}/g)) {
      const r = tableRangeAt(text, m.index! + 1)
      if (r && r.from === m.index) out.push({ file: f, src: text.slice(r.from, r.to) })
    }
    return out
  })

  it('finds them', () => expect(tables.length).toBeGreaterThan(10))

  it('survive a round trip with only whitespace changed', () => {
    let parsed = 0
    for (const { file, src } of tables) {
      const model = parseTable(src)
      if (!model) continue
      parsed++
      const out = serializeTable(model)
      // A float's own lines may be reordered (\centering, \caption, \label), so compare the tabular exactly.
      const tab = (s: string) => /\\begin\{tabular[\s\S]*\\end\{tabular[x*]?\}/.exec(s)?.[0] ?? s
      expect(squash(tab(out)), file).toBe(squash(tab(src)))
      expect(parseTable(out), file).toEqual(model)
    }
    expect(parsed).toBeGreaterThan(tables.length * 0.7)
  })
})

describe('parseTable', () => {
  const src = [
    '\\begin{table}[htbp]',
    '  \\centering',
    '  \\caption{Masses}\\label{tab:m}',
    '  \\begin{tabular}{@{}l|>{\\bfseries}c p{2cm} S[table-format=2.1]@{}}',
    '    \\toprule',
    '    Name & \\multicolumn{2}{c}{Both} & {Mass} \\\\ \\midrule',
    '    a & b & c & 1.5 \\\\[2pt]',
    '    \\cline{1-2}',
    '    d & e & f & 12.0 \\\\',
    '    \\bottomrule',
    '  \\end{tabular}',
    '\\end{table}',
  ].join('\n')

  it('reads the spec, spans, rules and float', () => {
    const m = parseTable(src)!
    expect(m.cols.map((c) => c.align)).toEqual(['l', 'c', 'p', 'S'])
    expect(m.cols[1].pre).toBe('>{\\bfseries}')
    expect(m.cols[2].arg).toBe('2cm')
    expect(m.cols[3].arg).toBe('table-format=2.1')
    expect(m.seps).toEqual(['@{}', '|', '', '', '@{}'])
    expect(m.rows[0].cells.map((c) => c?.tex ?? null)).toEqual(['Name', 'Both', null, '{Mass}'])
    expect(m.rows[0].rules).toEqual(['\\toprule'])
    expect(m.rows[1].rules).toEqual(['\\midrule'])
    expect(m.rows[1].gap).toBe('[2pt]')
    expect(m.rows[2].rules).toEqual(['\\cline{1-2}'])
    expect(m.rulesBelow).toEqual(['\\bottomrule'])
    expect(m.float).toMatchObject({ placement: 'htbp', caption: 'Masses', label: 'tab:m', centering: true, captionBelow: false })
    expect(specString(m)).toBe('@{}l|>{\\bfseries}cp{2cm}S[table-format=2.1]@{}')
    expect(styleOf(m)).toBe('booktabs')
    expect(packagesFor(m).sort()).toEqual(['array', 'booktabs', 'siunitx'])
  })

  it('writes aligned columns', () => {
    const out = serializeTable(parseTable('\\begin{tabular}{lr}\na & 1\\\\\nlonger & 22\\\\\n\\end{tabular}')!)
    expect(out).toBe(['\\begin{tabular}{lr}', '    a      & 1 \\\\', '    longer & 22 \\\\', '\\end{tabular}'].join('\n'))
  })

  it('leaves tables with comments to the source view', () => {
    expect(parseTable('\\begin{tabular}{l}\na \\\\ % note\n\\end{tabular}')).toBeNull()
    expect(parseTable('\\begin{tabular}{l}\n5\\% \\\\\n\\end{tabular}')).not.toBeNull()
  })

  it('finds the table around the cursor, preferring the float', () => {
    const text = `x\n${src}\ny`
    const r = tableRangeAt(text, text.indexOf('1.5'))!
    expect(text.slice(r.from, r.to)).toBe(src)
    expect(tableRangeAt(text, 0)).toBeNull()
  })
})

describe('editing', () => {
  const base = () => parseTable('\\begin{tabular}{|l|c|r|}\n\\hline\na & \\multicolumn{2}{c|}{bc} \\\\\n\\hline\nd & e & f \\\\\n\\hline\n\\end{tabular}')!

  it('inserts a column, growing a span it falls inside', () => {
    const m = insertColumn(base(), 2)
    expect(m.cols).toHaveLength(4)
    expect(m.rows[0].cells.map((c) => c?.span ?? 0)).toEqual([1, 3, 0, 0])
    expect(m.rows[1].cells.map((c) => c?.tex)).toEqual(['d', 'e', '', 'f'])
    expect(specString(m)).toBe('|l|c|l|r|')
  })

  it('deletes a column, shrinking a span', () => {
    const m = deleteColumn(base(), 1)
    expect(specString(m)).toBe('|l|r|')
    expect(m.rows[0].cells.map((c) => c && [c.tex, c.span])).toEqual([['a', 1], ['bc', 1]])
    expect(m.rows[1].cells.map((c) => c?.tex)).toEqual(['d', 'f'])
  })

  it('merges and splits cells', () => {
    const merged = mergeCells(base(), 1, 0, 1)
    expect(merged.rows[1].cells.map((c) => c && [c.tex, c.span])).toEqual([['d e', 2], null, ['f', 1]])
    expect(splitCell(merged, 1, 1).rows[1].cells.map((c) => c?.tex)).toEqual(['d e', '', 'f'])
  })

  it("won't move a column through a span", () => {
    const m = base()
    expect(moveColumn(m, 1, 1)).toBe(m)
    expect(moveColumn(m, 0, 1)).toBe(m)
  })

  it('switches styles', () => {
    const b = applyStyle(base(), 'booktabs')
    expect(b.seps.join('')).toBe('')
    expect(b.rows.map((r) => r.rules)).toEqual([['\\toprule'], ['\\midrule']])
    expect(b.rulesBelow).toEqual(['\\bottomrule'])
    expect(styleOf(applyStyle(b, 'grid'))).toBe('grid')
    expect(styleOf(applyStyle(b, 'plain'))).toBe('plain')
  })

  it('pastes a grid, growing the table', () => {
    const m = pasteGrid(base(), 1, 2, [['x', 'y'], ['z', 'w']])
    expect(m.cols).toHaveLength(4)
    expect(m.rows).toHaveLength(3)
    expect(m.rows[1].cells.map((c) => c?.tex)).toEqual(['d', 'e', 'x', 'y'])
    expect(m.rows[2].cells.map((c) => c?.tex)).toEqual(['', '', 'z', 'w'])
  })

  it('makes new booktabs tables, right-aligning number columns', () => {
    const m = newTable([['Trial', 'Time (s)'], ['1', '2.31'], ['2', '2.29']])
    expect(m.cols.map((c) => c.align)).toEqual(['r', 'r'])
    const out = serializeTable(m)
    expect(out).toContain('\\toprule')
    expect(out).toContain('\\caption{}')
    expect(out.split('\n')[0]).toBe('\\begin{table}[htbp]')
  })

  it('braces text in S columns', () => {
    const m = parseTable('\\begin{tabular}{S}\nMass \\\\\n1.5 \\\\\n\\end{tabular}')!
    expect(serializeTable(m)).toContain('{Mass}')
    expect(serializeTable(m)).not.toContain('{1.5}')
  })
})

describe('clipboard', () => {
  it('reads Excel TSV with quoted cells', () => {
    expect(parseTsv('a\t"b\tc"\r\n"say ""hi"""\t"two\nlines"\r\n')).toEqual([
      ['a', 'b\tc'],
      ['say "hi"', 'two\nlines'],
    ])
  })

  it('reads an HTML table with colspan and entities', () => {
    expect(parseHtmlTable('<table><tr><th colspan="2">A &amp; B</th></tr><tr><td>1<br>2</td><td>&lt;3</td></tr></table>')).toEqual([
      ['A & B', ''],
      ['1 2', '<3'],
    ])
  })

  it('escapes LaTeX specials', () => {
    expect(escapeLatex('50% of $5 & x_1 {a} ~^ \\')).toBe('50\\% of \\$5 \\& x\\_1 \\{a\\} \\textasciitilde{}\\textasciicircum{} \\textbackslash{}')
  })

  it('recognises table data, and not ordinary text', () => {
    expect(clipboardGrid('a\tb\n1\t2\n', '')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(clipboardGrid('just some text', '')).toBeNull()
    expect(clipboardGrid('one\ttab', '')).toEqual([['one', 'tab']])
    expect(clipboardGrid('x', '<table><tr><td>5%</td><td>b</td></tr></table>')).toEqual([['5\\%', 'b']])
    expect(clipboardGrid('5%\tb', '', true)).toEqual([['5%', 'b']])
  })
})
