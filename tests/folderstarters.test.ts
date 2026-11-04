import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listStarters, useBuiltInStarters, writeStarter } from '../src/main/starters'
import { Vault } from '../src/main/vault'
import { starterFields } from '../src/shared/starters'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Writes `files` (relative path → text or bytes) under the global starters folder, and returns a vault using it. */
function setup(files: Record<string, string | Buffer>): Vault {
  dir = mkdtempSync(join(tmpdir(), 'folderstarters-'))
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, 'global', 'starters', rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  mkdirSync(join(dir, 'vault'), { recursive: true })
  return new Vault(join(dir, 'vault'), join(dir, 'global'))
}

const mine = async (vault: Vault) => (await listStarters(vault)).filter((s) => s.source === 'global')

describe('folder starters', () => {
  it('names a folder starter after its folder, with main.tex as its entry file', async () => {
    const vault = setup({
      'Thesis/main.tex': '%% starter: A thesis\n\\input{chapter}',
      'Thesis/chapter.tex': '\\chapter{One}',
      'Thesis/references.bib': '',
    })
    const [s] = await mine(vault)
    expect(s).toMatchObject({ name: 'Thesis', ext: '.tex', description: 'A thesis', text: '%% starter: A thesis\n\\input{chapter}' })
    expect(s.files?.map((f) => f.path).sort()).toEqual(['chapter.tex', 'references.bib'])
  })

  it("takes a folder's only top-level .tex file as its entry when there's no main.tex", async () => {
    const vault = setup({ 'Notes/notes.tex': 'hi', 'Notes/parts/a.tex': 'a' })
    const [s] = await mine(vault)
    expect(s.text).toBe('hi')
    expect(s.files?.map((f) => f.path)).toEqual(['parts/a.tex'])
  })

  it('skips a folder with no main.tex and not exactly one top-level .tex file', async () => {
    const vault = setup({ 'Two/a.tex': '', 'Two/b.tex': '', 'None/x.bib': '', 'Fine.tex': 'ok' })
    expect((await mine(vault)).map((s) => s.name)).toEqual(['Fine'])
  })

  it("lists a .keep's folder as one to make, and not the .keep itself", async () => {
    const vault = setup({ 'Lab/main.tex': '', 'Lab/figures/.keep': '' })
    const [s] = await mine(vault)
    expect(s.files).toEqual([{ path: 'figures', kind: 'folder' }])
  })

  it('reads text files as text and leaves others to be copied as bytes', async () => {
    const vault = setup({ 'Lab/main.tex': '', 'Lab/style.sty': '% sty', 'Lab/logo.png': Buffer.from([0x89, 0x50, 0, 1]) })
    const [s] = await mine(vault)
    expect(s.files).toEqual([
      { path: 'logo.png', kind: 'binary' },
      { path: 'style.sty', kind: 'text', text: '% sty' },
    ])
  })

  it('replaces a built-in starter of the same name', async () => {
    const vault = setup({ 'Article/main.tex': 'my article' })
    const named = (await listStarters(vault)).filter((s) => s.name === 'Article')
    expect(named).toHaveLength(1)
    expect(named[0].source).toBe('global')
  })
})

describe('built-in starters', () => {
  it('are read from resources/starters/, in the order they were listed before', async () => {
    const vault = setup({})
    const builtIn = (await listStarters(vault)).filter((s) => s.source === 'built-in')
    expect(builtIn.map((s) => s.name)).toEqual([
      'Blank LaTeX file',
      'Article',
      'Handout',
      'Lab report (revtex)',
      'Long lab report (revtex)',
      'Section',
      'Standalone figure',
      'Bibliography',
      'Markdown note',
      'Plain text',
    ])
    expect(builtIn.find((s) => s.name === 'Section')?.description).toBe('A section to \\input into a larger document')
    for (const s of builtIn) expect(s.description, s.name).toBeTruthy()
  })

  it('read their files afresh each time', async () => {
    const root = mkdtempSync(join(tmpdir(), 'builtins-'))
    try {
      writeFileSync(join(root, 'Memo.tex'), '%% starter: First\n')
      useBuiltInStarters(root)
      const vault = setup({})
      expect((await listStarters(vault)).find((s) => s.name === 'Memo')?.description).toBe('First')
      writeFileSync(join(root, 'Memo.tex'), '%% starter: Second\n')
      expect((await listStarters(vault)).find((s) => s.name === 'Memo')?.description).toBe('Second')
    } finally {
      useBuiltInStarters(join(process.cwd(), 'resources', 'starters'))
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('starterFields', () => {
  it('asks for a field once across all the text files', async () => {
    const vault = setup({
      'Lab/main.tex': '\\title{{{Title}}} {{Author|Ada}}',
      'Lab/notes.md': '# {{Title}} for {{Course}}',
      'Lab/references.bib': '% {{Author}}',
    })
    const [s] = await mine(vault)
    expect(starterFields(s)).toEqual([
      { name: 'Title', default: '' },
      { name: 'Author', default: 'Ada' },
      { name: 'Course', default: '' },
    ])
  })
})

describe('writeStarter', () => {
  const auto = { date: '2026-11-04', filename: 'report.tex', basename: 'report' }

  it('writes the entry file under its new name and the others beside it, filled', async () => {
    const vault = setup({
      'Lab/main.tex': '%% starter: Lab\n\\title{{{Title}}} \\input{sections/intro}',
      'Lab/sections/intro.tex': '% {{Title}} in {{filename}}',
      'Lab/figures/.keep': '',
      'Lab/logo.png': Buffer.from([0x89, 0x50, 0x0d, 0x0a, 0xff]),
    })
    const [s] = await mine(vault)
    const root = join(dir, 'vault')
    await writeStarter(new Vault(root), 'work/report.tex', s, { Title: 'Pendulum' }, auto)
    expect(readFileSync(join(root, 'work', 'report.tex'), 'utf8')).toBe('\\title{Pendulum} \\input{sections/intro}')
    expect(readFileSync(join(root, 'work', 'sections', 'intro.tex'), 'utf8')).toBe('% Pendulum in report.tex')
    expect(existsSync(join(root, 'work', 'figures'))).toBe(true)
    expect(existsSync(join(root, 'work', 'figures', '.keep'))).toBe(false)
    expect(readFileSync(join(root, 'work', 'logo.png')).equals(Buffer.from([0x89, 0x50, 0x0d, 0x0a, 0xff]))).toBe(true)
  })

  it('leaves files that are already there untouched', async () => {
    const vault = setup({ 'Lab/main.tex': 'new main', 'Lab/references.bib': 'new bib', 'Lab/extra.txt': 'extra' })
    const [s] = await mine(vault)
    const root = join(dir, 'vault')
    writeFileSync(join(root, 'references.bib'), 'mine')
    await writeStarter(new Vault(root), 'report.tex', s, {}, auto)
    expect(readFileSync(join(root, 'report.tex'), 'utf8')).toBe('new main')
    expect(readFileSync(join(root, 'references.bib'), 'utf8')).toBe('mine')
    expect(readFileSync(join(root, 'extra.txt'), 'utf8')).toBe('extra')
  })

  it('refuses, writing nothing, when the entry file is already there', async () => {
    const vault = setup({ 'Lab/main.tex': 'new main', 'Lab/extra.txt': 'extra' })
    const [s] = await mine(vault)
    const root = join(dir, 'vault')
    writeFileSync(join(root, 'report.tex'), 'my report')
    await expect(writeStarter(new Vault(root), 'report.tex', s, {}, auto)).rejects.toThrow('report.tex already exists')
    expect(readFileSync(join(root, 'report.tex'), 'utf8')).toBe('my report')
    expect(existsSync(join(root, 'extra.txt'))).toBe(false)
  })

  it("keeps a CRLF starter's line breaks around a value typed with \\n", async () => {
    const vault = setup({ 'Note.md': '# {{Title}}\r\n\r\n{{Body text}}\r\n' })
    const [s] = await mine(vault)
    const root = join(dir, 'vault')
    await writeStarter(new Vault(root), 'n.md', s, { Title: 'T', 'Body text': 'a\nb' }, auto)
    expect(readFileSync(join(root, 'n.md'), 'utf8')).toBe('# T\r\n\r\na\r\nb\r\n')
  })
})
