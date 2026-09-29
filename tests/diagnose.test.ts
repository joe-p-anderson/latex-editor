// Each broken document in fixtures/errors declares, in its first line, what
// the headline problem should be. The committed logs make this run without TeX.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Problem } from '../src/shared/api'
import { applyEdits } from '../src/shared/edits'
import { diagnoseContext } from '../src/main/compile'
import { diagnose } from '../src/main/diagnose'
import { parseLog } from '../src/main/logparser'
import { Vault } from '../src/main/vault'
import { ERRORS_VAULT, errorCases } from './helpers'

const vault = new Vault(ERRORS_VAULT)
beforeAll(() => vault.load())

/** The problem a user should look at first. */
const headline = (ps: Problem[]) => ps.find((p) => !p.hidden && !p.followOn)

describe.each(errorCases())('$name', ({ tex, log, expect: want }) => {
  let problems: Problem[]
  beforeAll(async () => {
    // A missing .aux path makes labels come from the source, as in a fresh clone.
    problems = await diagnose(parseLog(log), diagnoseContext(vault, tex, log, join(ERRORS_VAULT, 'no-such.aux')))
  })

  it(`headline is ${want.rule}${want.line ? ` on line ${want.line}` : ''}`, () => {
    const p = headline(problems)
    expect(p?.rule).toBe(want.rule)
    if (want.line) expect(p?.line).toBe(want.line)
  })

  it('offers the expected suggestion, if any', () => {
    const p = headline(problems)!
    const text = [p.explanation ?? '', ...p.fixes.map((f) => f.label)].join('\n')
    if (want.suggest) expect(text).toContain(want.suggest)
    if (want.package) expect(p.fixes.map((f) => f.label)).toContain(`Add \\usepackage{${want.package}}`)
    if (want.opened) expect(p.related?.map((r) => r.line)).toContain(want.opened)
    if (want.nosuggest) expect(p.fixes).toEqual([])
  })

  it('has quick fixes that apply cleanly to the source', () => {
    for (const fix of headline(problems)!.fixes) {
      const files = new Set(fix.edits.map((e) => e.file))
      for (const f of files) {
        const src = readFileSync(join(ERRORS_VAULT, f), 'utf8')
        expect(() => applyEdits(src, fix.edits.filter((e) => e.file === f)), fix.label).not.toThrow()
      }
    }
  })

  it('shows no more than one headline error', () => {
    // Everything else should be marked as a follow-on or hidden noise.
    expect(problems.filter((p) => p.severity === 'error' && !p.hidden && !p.followOn).length).toBeLessThanOrEqual(1)
  })
})
