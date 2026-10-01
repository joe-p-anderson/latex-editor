import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { authorsShort, bibciteLabels, citedKeys, OPEN_CITE, parseBib, parseBlg, plainField, searchBib, summarize, surnames } from '../src/shared/bibtex'
import { bibNamesIn } from '../src/main/bibliography'

const FIXTURE = resolve(import.meta.dirname, '../fixtures/vaults/AngStatsRevTex/AngStatsBib.bib')

describe('parseBib', () => {
  it('reads entries with braced, quoted and bare values, and their lines', () => {
    const bib = [
      '% a comment line',
      '@string{jmps = "J. Mech. Phys. Solids"}',
      '@Article{smith2001,',
      '  author = {Smith, John and {de Wit}, Roland},',
      '  title = "A {Nested} Title",',
      '  journal = jmps,',
      '  year = 2001,',
      '  month = apr',
      '}',
      '@comment{not an entry}',
      '@book(jones, title = {Parens} # " joined")',
    ].join('\r\n')
    const [a, b] = parseBib(bib)
    expect(a).toMatchObject({ type: 'article', key: 'smith2001', line: 3 })
    expect(a.fields).toMatchObject({ author: 'Smith, John and {de Wit}, Roland', title: 'A {Nested} Title', journal: 'J. Mech. Phys. Solids', year: '2001', month: 'April' })
    expect(b).toMatchObject({ type: 'book', key: 'jones', line: 11 })
    expect(b.fields.title).toBe('Parens joined')
  })

  it('reads every entry of the paper fixture', () => {
    const text = readFileSync(FIXTURE, 'utf8')
    const entries = parseBib(text)
    expect(entries).toHaveLength((text.match(/^@/gm) ?? []).length)
    const lines = text.split(/\r?\n/)
    for (const e of entries) expect(lines[e.line - 1]).toContain(`{${e.key},`)
    const kocks = entries.find((e) => e.key === 'kocksPhysicsPhenomenologyStrain2003')!
    expect(summarize(kocks, 'AngStatsBib.bib')).toMatchObject({ author: 'Kocks and Mecking', year: '2003' })
  })
})

describe('names and fields', () => {
  it('shortens author lists', () => {
    expect(authorsShort('Anderson, Joseph Pierre')).toBe('Anderson')
    expect(authorsShort('Anderson, J. and El-Azab, Anter')).toBe('Anderson and El-Azab')
    expect(authorsShort('A, B and C, D and E, F')).toBe('A et al.')
    expect(authorsShort('Roland de Wit')).toBe('de Wit')
    expect(authorsShort('{Bao-Tong}, Ma and Laird, C.')).toBe('Bao-Tong and Laird')
    expect(surnames('{The Materials Project}')).toEqual(['The Materials Project'])
  })

  it('turns accents and braces into plain text', () => {
    expect(plainField('Kr\\"{o}ner')).toBe('Kröner')
    expect(plainField("{\\'E}cole {Polytechnique}")).toBe('École Polytechnique')
    expect(plainField('Pages 1--4 \\& more')).toBe('Pages 1–4 & more')
  })
})

describe('aux and source', () => {
  it('reads natbib and plain \\bibcite labels', () => {
    const aux = '\\bibcite{kocks}{{1}{2003}{{Kocks\\ and\\ Mecking}}{{}}}\n\\bibcite{plain}{7}\n'
    expect(bibciteLabels(aux)).toEqual({ kocks: '1', plain: '7' })
  })

  it('finds cite commands, open or closed', () => {
    expect(citedKeys('see \\cite{a, b} and \\citep[p.~4]{c} and \\parencite*{d}')).toEqual(['a', 'b', 'c', 'd'])
    expect(OPEN_CITE.exec('text \\citet[see][]{a,kock')?.[1]).toBe('a,kock')
    expect(OPEN_CITE.exec('text \\ref{eq')).toBeNull()
  })

  it('finds the .bib files a document names', () => {
    expect(bibNamesIn('\\bibliography{AngStatsBib, other}\n% \\bibliography{old}\n\\addbibresource[glob]{x.bib}')).toEqual(['AngStatsBib', 'other', 'x.bib'])
  })
})

describe('searchBib', () => {
  const entries = parseBib(readFileSync(FIXTURE, 'utf8')).map((e) => summarize(e, 'x.bib'))

  it('needs every word to match, and ranks key and author matches first', () => {
    const hits = searchBib(entries, 'kocks 2003')
    expect(hits[0].key).toBe('kocksPhysicsPhenomenologyStrain2003')
    expect(hits.every((h) => `${h.key} ${h.authors} ${h.title} ${h.year}`.toLowerCase().includes('kocks'))).toBe(true)
  })

  it('filters by tag with #', () => {
    const hits = searchBib(entries, '#plasticity')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => h.tags.some((t) => t.toLowerCase().includes('plasticity')))).toBe(true)
  })
})

describe('parseBlg', () => {
  // A real BibTeX log (trimmed): a missing file, a syntax error, a repeated key, warnings.
  const blg = [
    'I couldn\'t open database file nothere.bib',
    '---line 7 of file doc.aux',
    ' : \\bibdata{refs,nothere',
    ' :                      }',
    "I'm skipping whatever remains of this command",
    'Database file #1: refs.bib',
    'I was expecting an "="---line 3 of file refs.bib',
    ' :   author  ',
    ' :           {X, Y},',
    "I'm skipping whatever remains of this entry",
    'Repeated entry---line 7 of file refs.bib',
    ' : @article{b',
    "I'm skipping whatever remains of this entry",
    'Warning--I didn\'t find a database entry for "missing"',
    'Warning--empty journal in a',
    '(There were 3 error messages)',
  ].join('\n')

  it('turns each message into an error or warning with its place', () => {
    const msgs = parseBlg(blg)
    expect(msgs.map((m) => [m.severity, m.file, m.line, !!m.hidden])).toEqual([
      ['error', 'nothere.bib', null, false],
      ['error', 'refs.bib', 3, false],
      ['error', 'refs.bib', 7, false],
      ['warning', null, null, true],
    ])
    expect(msgs[1].message).toMatch(/expected "="/)
  })

  it('reads biber errors', () => {
    const msgs = parseBlg("[42] Utils.pm:410> ERROR - BibTeX subsystem: C:/v/refs.bib_1234.utf8, line 12, syntax error: found \"}\"\n[43] Biber.pm:131> WARN - Duplicate entry key 'a' in file 'refs.bib'")
    expect(msgs.map((m) => [m.severity, m.file, m.line, !!m.hidden])).toEqual([
      ['error', 'C:/v/refs.bib', 12, false],
      ['warning', 'refs.bib', null, true],
    ])
    // Newer biber names a hashed temporary copy: the line is known, the file isn't.
    const hashed = parseBlg('[1777] Utils.pm:479> ERROR - BibTeX subsystem: C:\\T\\biber_tmp_RTcD\\5b021aee_38812.utf8, line 15, syntax error: found "{A}", expected "="')
    expect(hashed.map((m) => [m.severity, m.file, m.line])).toEqual([['error', null, 15]])
  })
})
