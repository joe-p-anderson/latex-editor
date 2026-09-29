import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseLog } from '../src/main/logparser'
import { ERRORS_VAULT } from './helpers'

const log = (name: string) => readFileSync(join(ERRORS_VAULT, 'logs', `${name}.log`), 'utf8')

describe('parseLog', () => {
  it('reads an error with its location and TeX context', () => {
    const [e] = parseLog(log('01_undefined_command')).filter((x) => x.level === 'error')
    expect(e).toMatchObject({
      file: '01_undefined_command.tex',
      line: 7,
      message: 'Undefined control sequence.',
      context: { before: 'The velocity $\\vect', after: '{v}$ points east.' },
    })
  })

  it('captures the runaway text before "File ended while scanning"', () => {
    const [e] = parseLog(log('05_unclosed_brace')).filter((x) => x.level === 'error')
    expect(e.message).toMatch(/^File ended while scanning use of \\textbf/)
    expect(e.runaway).toMatch(/^\{bold text that never closes\./)
  })

  it('gives a "! ... not found" error the location of the Emergency stop after it', () => {
    const [e] = parseLog(log('12_missing_input')).filter((x) => x.level === 'error')
    expect(e).toMatchObject({ message: "LaTeX Error: File `Pieces/intor.tex' not found.", file: '12_missing_input.tex', line: 6 })
  })

  it('reads a warning with its line and the file TeX was in', () => {
    const w = parseLog(log('15_undefined_reference')).find((x) => /Reference/.test(x.message))
    expect(w).toMatchObject({ level: 'warning', file: '15_undefined_reference.tex', line: 9 })
  })

  it('joins package warning continuation lines', () => {
    const text = [
      'Package fancyhdr Warning: \\headheight is too small (12.0pt): ',
      '(fancyhdr)                Make it at least 58.28253pt, for example:',
      '(fancyhdr)                \\setlength{\\headheight}{58.28253pt}.',
      '',
    ].join('\n')
    const [w] = parseLog(text)
    expect(w.source).toBe('fancyhdr')
    expect(w.message).toBe('\\headheight is too small (12.0pt): Make it at least 58.28253pt, for example: \\setlength{\\headheight}{58.28253pt}.')
  })

  it('reads bad boxes with their line range', () => {
    const text = 'Overfull \\hbox (8.3334pt too wide) in paragraph at lines 137--138\n[]\\T1/qbk/b/n/12 (-20) Force is\n []\n\n'
    expect(parseLog(text)).toMatchObject([{ level: 'badbox', line: 137 }])
  })

  // The older logs (wrapped at 79 columns, from before -max-print-line) are
  // a robustness check: whatever they contain, parsing must not throw.
  it('parses every archived log without throwing', () => {
    const dir = resolve(import.meta.dirname, '../fixtures/logs')
    for (const f of readdirSync(dir)) expect(() => parseLog(readFileSync(join(dir, f), 'utf8'))).not.toThrow()
  })
})
