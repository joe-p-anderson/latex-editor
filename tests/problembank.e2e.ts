// End to end for the problem bank: in a temporary copy of the 1200-latex
// vault, take a question out of HW1 into the bank, check the \input that
// replaces it, and build the preview wrapper with pdflatex.
// Needs MiKTeX: npx vitest run --project e2e tests/problembank.e2e.ts
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileScratch } from '../src/main/compile'
import { Vault } from '../src/main/vault'
import {
  buildDocument,
  dedentBlock,
  detectNeeds,
  entryFor,
  findQuestionBlock,
  inputArg,
  makeFragment,
  newFragmentPath,
  serializeProblem,
  usedInTexts,
} from '../src/plugins/problem-bank/bank'

const SOURCE = resolve(import.meta.dirname, '../fixtures/vaults/1200-latex')
const HW1 = 'Homework/HW1_units_and_expressions.tex'
// The long path: TeX can't read a Windows short name (JANDER~1).
const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'latex-editor-bank-')))
let vault: Vault
let fragment = ''
let fragmentRel = ''

const read = (rel: string) => readFileSync(join(dir, rel), 'utf8').replace(/\r\n/g, '\n')

beforeAll(async () => {
  cpSync(SOURCE, dir, { recursive: true, filter: (src) => !/[\\/](\.texcache|pdf)$/.test(src) })
  // The copy lives elsewhere, so point it at the template library (the handout class) absolutely.
  writeFileSync(join(dir, '.vault.json'), JSON.stringify({ templates: resolve(SOURCE, '../../_templates') }))
  vault = new Vault(dir)
  await vault.load()
}, 60_000)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('a question taken out of HW1', () => {
  it('becomes a fragment with what it needs, and an \\input in its place', () => {
    const text = read(HW1)
    const block = findQuestionBlock(text, text.indexOf('Unit conversions') + 5)!
    expect(block).not.toBeNull()
    const source = text.slice(block.from, block.to)
    expect(source).toContain('\\solarmass')

    const preamble = text.slice(0, text.indexOf('\\begin{document}'))
    const { needs, preamble: defs } = detectNeeds(source, preamble)
    expect(needs).toContain('siunitx')
    expect(defs).toEqual(['\\DeclareSIUnit{\\solarmass}{\\text{M}_{\\odot}}'])

    fragmentRel = newFragmentPath('Problems', 'Unit conversions', (r) => existsSync(join(dir, r)))
    fragment = serializeProblem({ title: 'Unit conversions', tags: ['units'], needs, preamble: defs }, dedentBlock(text, block) + '\n')
    mkdirSync(join(dir, 'Problems'), { recursive: true }) // (the plugin writes through ctx.vault.write, which makes folders)
    writeFileSync(join(dir, fragmentRel), fragment)

    // One change replaces the block.
    const edited = text.slice(0, block.from) + `\\input{${inputArg(fragmentRel)}}` + text.slice(block.to)
    writeFileSync(join(dir, HW1), edited)
    const after = read(HW1)
    expect(after).toContain('\\input{Problems/unit_conversions}')
    expect(after).not.toContain('Unit conversions')
    expect(after.match(/\\question/g)!.length).toBe(text.match(/\\question/g)!.length - 1)
    expect(fragment).toMatch(/^% problem: Unit conversions\n% tags: units\n% needs: siunitx, amsmath\n% preamble: \\DeclareSIUnit/)
    expect(fragment).toContain('\\question \\textbf{Unit conversions}')
  })

  it('shows HW1 as a user of the fragment', () => {
    const used = usedInTexts([fragmentRel], { [HW1]: read(HW1) })
    expect(used.get(fragmentRel)).toEqual([HW1])
  })

  it('builds in the preview wrapper with the exam class', async () => {
    const f = makeFragment(fragmentRel, fragment, { library: false })
    const source = buildDocument({ preamble: null, documentClass: 'exam', entries: [entryFor(f)] })
    expect(source).toContain('\\DeclareSIUnit{\\solarmass}')
    const r = await compileScratch(vault, join(dir, '.texcache', 'plugins', 'problem-bank'), 'check', source)
    expect(r.problems.filter((p) => p.severity === 'error' && !p.hidden)).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.pdf).not.toBeNull()
  }, 120_000)

  it('builds with a _preamble.tex in the bank', async () => {
    const pre = '\\documentclass{handout}\n\\assignment{Check}\n\\title{Check}\n'
    writeFileSync(join(dir, 'Problems', '_preamble.tex'), pre)
    const f = makeFragment(fragmentRel, fragment, { library: false })
    const source = buildDocument({ preamble: pre, documentClass: 'exam', entries: [entryFor(f)] })
    expect(source).toContain('\\documentclass{handout}')
    const r = await compileScratch(vault, join(dir, '.texcache', 'plugins', 'problem-bank'), 'check', source)
    expect(r.problems.filter((p) => p.severity === 'error' && !p.hidden)).toEqual([])
    expect(r.ok).toBe(true)
  }, 120_000)

  it('reports a broken problem', async () => {
    const f = makeFragment('Problems/broken.tex', '\\question What is \\undefinedthing here?\n', { library: false })
    const source = buildDocument({ preamble: null, documentClass: 'exam', entries: [entryFor(f)] })
    const r = await compileScratch(vault, join(dir, '.texcache', 'plugins', 'problem-bank'), 'check', source)
    expect(r.ok).toBe(false)
    expect(r.problems.some((p) => p.severity === 'error' && !p.hidden)).toBe(true)
  }, 120_000)
})

describe('the main half', () => {
  it('indexes the bank with its users, saves, checks and writes an assignment', async () => {
    const { default: main } = await import('../src/plugins/problem-bank/main')
    const { readFile, mkdir, writeFile } = await import('node:fs/promises')
    const handlers = new Map<string, (...a: any[]) => any>()
    const events: string[] = []
    const settings = { bank: 'Problems', insertMode: 'input', previewClass: 'exam' }
    await main({
      id: 'problem-bank',
      vault: {
        root: dir,
        name: 'v',
        abs: (r: string) => vault.abs(r),
        rel: (a: string) => vault.rel(a),
        read: (r: string) => readFile(vault.abs(r), 'utf8'),
        readOptional: (r: string) => readFile(vault.abs(r), 'utf8').catch(() => null),
        write: async (r: string, t: string) => {
          await mkdir(join(dir, r, '..'), { recursive: true })
          await writeFile(vault.abs(r), t)
        },
        files: () => vault.files(),
        onFile: () => {},
      },
      settings: { global: () => ({ library: '' }), vault: () => settings, setGlobal: async () => {}, setVault: async () => {}, onChange: () => {} },
      cacheDir: join(dir, '.texcache', 'plugins', 'problem-bank'),
      handle: (n: string, f: (...a: any[]) => any) => void handlers.set(n, f),
      emit: (e: string) => void events.push(e),
      build: { before() {}, after() {}, fixes() {}, scratch: (n: string, s: string) => compileScratch(vault, join(dir, '.texcache', 'plugins', 'problem-bank'), n, s) },
      onDispose: () => {},
    } as never)

    const index = await handlers.get('index')!()
    const f = index.fragments.find((x: { id: string }) => x.id === fragmentRel)
    expect(f.title).toBe('Unit conversions')
    expect(f.usedIn).toEqual([HW1])
    expect(index.hasPreamble).toBe(true)
    // _preamble.tex is not a problem.
    expect(index.fragments.map((x: { id: string }) => x.id)).not.toContain('Problems/_preamble.tex')

    const saved = await handlers.get('save')!({ title: 'Unit conversions', tags: [] }, '\\question Second one\n')
    expect(saved.rel).toBe('Problems/unit_conversions_2.tex')
    expect(readFileSync(join(dir, saved.rel), 'utf8')).toBe('% problem: Unit conversions\n\\question Second one\n')

    const checked = await handlers.get('check')!(fragmentRel)
    expect(checked.ok).toBe(true)

    expect(await handlers.get('assignment')!('Homework/HW99', [fragmentRel, 'nope'])).toEqual({ rel: 'Homework/HW99.tex' })
    const hw = read('Homework/HW99.tex')
    expect(hw).toContain('\\documentclass{handout}')
    expect(hw).toContain('\\begin{questions}\n  \\input{Problems/unit_conversions}\n\\end{questions}')
    expect(await handlers.get('assignment')!('Homework/HW99', [fragmentRel])).toEqual({ error: 'Homework/HW99.tex already exists' })
  }, 180_000)
})
