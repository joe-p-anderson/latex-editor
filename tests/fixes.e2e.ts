// End to end: for each broken document, apply the headline problem's first
// quick fix and recompile with pdflatex. The fix must actually fix it.
// Runs in a temporary copy of fixtures/errors. Needs MiKTeX: npm run test:e2e
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyEdits } from '../src/shared/edits'
import { compile } from '../src/main/compile'
import { Vault } from '../src/main/vault'
import { ERRORS_VAULT, errorCases } from './helpers'

const dir = mkdtempSync(join(tmpdir(), 'latex-editor-e2e-'))
let vault: Vault

beforeAll(async () => {
  cpSync(ERRORS_VAULT, dir, { recursive: true, filter: (src) => !/[\\/](logs|\.texcache|pdf)$/.test(src) })
  // The copy lives elsewhere, so point it at the template library absolutely.
  writeFileSync(join(dir, '.vault.json'), JSON.stringify({ templates: resolve(ERRORS_VAULT, '../_templates') }))
  vault = new Vault(dir)
  await vault.load()
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const visibleErrors = (r: Awaited<ReturnType<typeof compile>>) =>
  r.problems.filter((p) => p.severity === 'error' && !p.hidden)

describe.each(errorCases())('$name', ({ tex, expect: want }) => {
  it('first quick fix makes it compile cleanly', async () => {
    const before = await compile(vault, tex)
    const headline = before.problems.find((p) => !p.hidden && !p.followOn)
    expect(headline?.rule).toBe(want.rule)
    const fix = headline!.fixes[0]
    if (!fix) return // no automatic fix offered (e.g. unclosed $, removed command)

    for (const file of new Set(fix.edits.map((e) => e.file))) {
      const path = join(dir, file)
      writeFileSync(path, applyEdits(readFileSync(path, 'utf8'), fix.edits.filter((e) => e.file === file)))
    }
    const after = await compile(vault, tex)
    expect(visibleErrors(after).map((p) => p.title), `after "${fix.label}"`).toEqual([])
    expect(after.problems.some((p) => p.rule === want.rule && !p.hidden), `${want.rule} still reported`).toBe(false)
  })
})
