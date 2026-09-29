import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ERRORS_VAULT = resolve(import.meta.dirname, '../fixtures/errors')

export interface Expectation {
  rule: string
  line?: number
  suggest?: string
  package?: string
  opened?: number
  nosuggest?: boolean
}

export interface ErrorCase {
  name: string // e.g. 01_undefined_command
  tex: string // file name in the errors vault
  log: string // the committed log text
  expect: Expectation
}

/** The broken documents in fixtures/errors, with the `% expect:` line from each. */
export function errorCases(): ErrorCase[] {
  return readdirSync(ERRORS_VAULT)
    .filter((f) => /^\d+_.*\.tex$/.test(f))
    .sort()
    .map((tex) => {
      const name = tex.replace(/\.tex$/, '')
      const src = readFileSync(join(ERRORS_VAULT, tex), 'utf8')
      const m = /^% expect: (\S+)(?: @(\d+))?(.*)$/m.exec(src)
      if (!m) throw new Error(`${tex} has no "% expect:" line`)
      const opts: Record<string, string | true> = Object.fromEntries(
        [...m[3].matchAll(/(\w+)(?:=(\S+))?/g)].map((o) => [o[1], o[2] ?? true]),
      )
      return {
        name,
        tex,
        log: readFileSync(join(ERRORS_VAULT, 'logs', `${name}.log`), 'utf8'),
        expect: {
          rule: m[1],
          line: m[2] ? Number(m[2]) : undefined,
          suggest: opts.suggest as string | undefined,
          package: opts.package as string | undefined,
          opened: opts.opened ? Number(opts.opened) : undefined,
          nosuggest: opts.nosuggest === true,
        },
      }
    })
}
