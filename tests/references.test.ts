import { describe, expect, it } from 'vitest'
import { findReferences, retarget } from '../src/shared/references'

const files = (...rels: string[]) => {
  const set = new Set<string>()
  for (const r of rels) {
    set.add(r)
    for (let i = r.indexOf('/'); i >= 0; i = r.indexOf('/', i + 1)) set.add(r.slice(0, i))
  }
  return (rel: string) => set.has(rel)
}
const apply = (text: string, changes: { from: number; to: number; insert: string }[]) =>
  [...changes].sort((a, b) => b.from - a.from).reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text)

describe('findReferences', () => {
  const exists = files('main.tex', 'sec/intro.tex', 'sec/more.tex', 'Images/fig.png', 'refs.bib', 'lib/a.bib')
  it('resolves from the file, then the root, adding implied extensions', () => {
    const text = '\\input{sec/intro}\n\\input{sec/more.tex}\n\\includegraphics[width=3cm]{Images/fig}\n\\bibliography{refs, lib/a}\n'
    const refs = findReferences(text, 'main.tex', exists)
    expect(refs.map((r) => [r.kind, r.target])).toEqual([
      ['input', 'sec/intro.tex'],
      ['input', 'sec/more.tex'],
      ['graphic', 'Images/fig.png'],
      ['bib', 'refs.bib'],
      ['bib', 'lib/a.bib'],
    ])
    for (const r of refs) expect(text.slice(r.from, r.to)).toBe(r.arg)
  })
  it('tries the file’s own folder before the root', () => {
    const refs = findReferences('\\input{more}', 'sec/intro.tex', exists)
    expect(refs[0]).toMatchObject({ target: 'sec/more.tex', fileRelative: true })
    expect(findReferences('\\includegraphics{Images/fig.png}', 'sec/intro.tex', exists)[0]).toMatchObject({ target: 'Images/fig.png', fileRelative: false })
  })
  it('ignores comments, macros and things that do not exist', () => {
    expect(findReferences('% \\input{sec/intro}\n\\input{\\name}\n\\input{nope}', 'main.tex', exists)).toEqual([])
  })
  it('reads \\import and \\graphicspath', () => {
    const text = '\\graphicspath{{Images/}{other/}}\n\\import{sec/}{intro}'
    const refs = findReferences(text, 'main.tex', files('main.tex', 'Images/fig.png', 'sec/intro.tex'))
    expect(refs.map((r) => [r.kind, r.target])).toEqual([
      ['graphicspath', 'Images'],
      ['import', 'sec/intro.tex'],
    ])
    expect(text.slice(refs[0].from, refs[0].to)).toBe('Images/')
  })
})

describe('retarget', () => {
  const exists = files('main.tex', 'sec/intro.tex', 'Images/fig.png', 'refs.bib', 'sec/more.tex')
  it('follows a moved file, keeping the way it was written', () => {
    const text = '\\input{sec/intro}\n\\includegraphics{Images/fig}\n\\bibliography{refs}'
    const refs = findReferences(text, 'main.tex', exists)
    const moves = [{ from: 'sec/intro.tex', to: 'body/intro.tex' }, { from: 'Images', to: 'figs' }, { from: 'refs.bib', to: 'bib/refs.bib' }]
    expect(apply(text, retarget(refs, moves, 'main.tex'))).toBe('\\input{body/intro}\n\\includegraphics{figs/fig}\n\\bibliography{bib/refs}')
  })
  it('keeps an explicit extension and does nothing for unrelated moves', () => {
    const text = '\\input{sec/intro.tex}'
    const refs = findReferences(text, 'main.tex', exists)
    expect(apply(text, retarget(refs, [{ from: 'sec/intro.tex', to: 'sec/start.tex' }], 'main.tex'))).toBe('\\input{sec/start.tex}')
    expect(retarget(refs, [{ from: 'refs.bib', to: 'x.bib' }], 'main.tex')).toEqual([])
  })
  it('repairs a moved file’s own relative references', () => {
    const text = '\\input{more}\n\\includegraphics{Images/fig}'
    const refs = findReferences(text, 'sec/intro.tex', exists)
    const changes = retarget(refs, [{ from: 'sec/intro.tex', to: 'body/intro.tex' }], 'sec/intro.tex')
    // \input{more} was relative to the file, which left its sibling; the root-relative image path still works.
    expect(apply(text, changes)).toBe('\\input{../sec/more}\n\\includegraphics{Images/fig}')
  })
  it('moves the whole folder together with its files without changing their references', () => {
    const text = '\\input{more}'
    const refs = findReferences(text, 'sec/intro.tex', exists)
    expect(retarget(refs, [{ from: 'sec', to: 'body/sec' }], 'sec/intro.tex')).toEqual([])
  })
  it('updates \\graphicspath folders', () => {
    const text = '\\graphicspath{{Images/}}'
    const refs = findReferences(text, 'main.tex', exists)
    expect(apply(text, retarget(refs, [{ from: 'Images', to: 'figs' }], 'main.tex'))).toBe('\\graphicspath{{figs/}}')
  })
})
