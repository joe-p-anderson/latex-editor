import { describe, expect, it } from 'vitest'
import { detectTeX, texName, type TexSystem } from '../src/main/tex'

const MIKTEX_VERSION = 'MiKTeX-pdfTeX 4.19 (MiKTeX 24.4)\n© 2024 Han The Thanh'
const TEXLIVE_VERSION = 'pdfTeX 3.141592653-2.6-1.40.26 (TeX Live 2024)\nkpathsea version 6.4.0'

/** A machine whose disk holds `files`, each `pdflatex.exe` answering --version with its text. */
function machine(files: Record<string, string>, path: string[] = [], dirs: Record<string, string[]> = {}): TexSystem {
  return {
    path,
    env: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' },
    exists: async (p) => p in files,
    listDir: async (p) => dirs[p] ?? [],
    version: async (exe) => files[exe] ?? null,
  }
}

const USER_MIKTEX = 'C:\\Users\\ada\\AppData\\Local\\Programs\\MiKTeX\\miktex\\bin\\x64'
const ALL_MIKTEX = 'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64'

describe('detectTeX', () => {
  it('finds pdflatex on PATH, with its distribution and version', async () => {
    const sys = machine({ 'D:\\tex\\bin\\pdflatex.exe': MIKTEX_VERSION }, ['C:\\Windows', 'D:\\tex\\bin'])
    expect(await detectTeX(sys)).toEqual({ bin: 'D:\\tex\\bin', distribution: 'MiKTeX', version: '24.4', onPath: true })
  })

  it('prefers PATH to the usual install folders', async () => {
    const sys = machine({ [`${USER_MIKTEX}\\pdflatex.exe`]: MIKTEX_VERSION, 'D:\\tl\\pdflatex.exe': TEXLIVE_VERSION }, ['D:\\tl'])
    expect((await detectTeX(sys))?.bin).toBe('D:\\tl')
  })

  it("looks in MiKTeX's per-user install, then its all-users one", async () => {
    const both = machine({ [`${USER_MIKTEX}\\pdflatex.exe`]: MIKTEX_VERSION, [`${ALL_MIKTEX}\\pdflatex.exe`]: MIKTEX_VERSION })
    expect(await detectTeX(both)).toEqual({ bin: USER_MIKTEX, distribution: 'MiKTeX', version: '24.4', onPath: false })
    const all = machine({ [`${ALL_MIKTEX}\\pdflatex.exe`]: MIKTEX_VERSION })
    expect((await detectTeX(all))?.bin).toBe(ALL_MIKTEX)
  })

  it("looks in TeX Live's folder last, newest year first", async () => {
    const dirs = { 'C:\\texlive': ['2023', 'texmf-local', '2024'] }
    const files = { 'C:\\texlive\\2023\\bin\\windows\\pdflatex.exe': TEXLIVE_VERSION, 'C:\\texlive\\2024\\bin\\windows\\pdflatex.exe': TEXLIVE_VERSION }
    expect(await detectTeX(machine(files, [], dirs))).toEqual({ bin: 'C:\\texlive\\2024\\bin\\windows', distribution: 'TeX Live', version: '2024', onPath: false })
    expect((await detectTeX(machine({ ...files, [`${ALL_MIKTEX}\\pdflatex.exe`]: MIKTEX_VERSION }, [], dirs)))?.bin).toBe(ALL_MIKTEX)
  })

  it('finds nothing when pdflatex is in none of them', async () => {
    expect(await detectTeX(machine({ 'C:\\Windows\\notepad.exe': '' }, ['C:\\Windows'], { 'C:\\texlive': ['2024'] }))).toBeNull()
  })

  it("still reports a pdflatex that won't say its version", async () => {
    const sys = machine({ 'D:\\tex\\pdflatex.exe': '' }, ['D:\\tex'])
    sys.version = async () => null
    expect(await detectTeX(sys)).toEqual({ bin: 'D:\\tex', distribution: 'TeX', version: '', onPath: true })
  })
})

describe('texName', () => {
  it('names the distribution and version for About endleaf, or nothing', () => {
    expect(texName({ bin: 'x', distribution: 'MiKTeX', version: '24.4', onPath: true })).toBe('MiKTeX 24.4')
    expect(texName({ bin: 'x', distribution: 'TeX', version: '', onPath: true })).toBe('TeX')
    expect(texName(null)).toBeNull()
  })
})
