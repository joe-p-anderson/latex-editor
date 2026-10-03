// Points in a build where plugins join in (src/main/plugins.ts registers
// them; compile.ts calls them). Kept apart from compile.ts so the build
// doesn't know about plugins, only that something may want to run.
import type { CompileResult, Problem, QuickFix } from '../shared/api'
import type { Vault } from './vault'

export type BuildKind = 'full' | 'draft' | 'section'

/** A build about to run its first pass. */
export interface BuildStart {
  kind: BuildKind
  vault: Vault
  /** The document being built, vault-relative. */
  root: string
  /** Its .texcache folder (aux, log, working PDF). */
  cacheDir: string
  /** The job name: the root's file name without .tex. */
  name: string
  /** Unsaved buffers built in place of the files on disk (a preview), or null. */
  buffers: Record<string, string> | null
}

/** A build that has finished and been diagnosed. */
export interface BuildEnd extends BuildStart {
  /** The .aux the build left (the full build's, for a section build). */
  auxPath: string
  result: CompileResult
}

export type BeforeBuild = (b: BuildStart) => void | Promise<void>
/** May return problems to add to the build's. */
export type AfterBuild = (b: BuildEnd) => void | Problem[] | Promise<void | Problem[]>
/** Extra fixes for one of the build's problems (e.g. "Add from Zotero" for an undefined citation). */
export type ProblemFixer = (p: Problem, b: BuildEnd) => QuickFix[] | Promise<QuickFix[]>

const before = new Set<BeforeBuild>()
const after = new Set<AfterBuild>()
const fixers = new Set<ProblemFixer>()

export function onBeforeBuild(f: BeforeBuild): () => void {
  before.add(f)
  return () => before.delete(f)
}
export function onAfterBuild(f: AfterBuild): () => void {
  after.add(f)
  return () => after.delete(f)
}
export function onProblemFixes(f: ProblemFixer): () => void {
  fixers.add(f)
  return () => fixers.delete(f)
}

/** Runs every before-build hook. A hook that fails is reported, not fatal. */
export async function runBeforeBuild(b: BuildStart): Promise<void> {
  for (const f of before) {
    try {
      await f(b)
    } catch (e) {
      console.error('before-build hook failed:', e)
    }
  }
}

/** Runs the after-build hooks and fixers, adding their problems and fixes to `b.result`. */
export async function runAfterBuild(b: BuildEnd): Promise<void> {
  for (const f of after) {
    try {
      const extra = await f(b)
      if (extra?.length) b.result.problems.push(...extra)
    } catch (e) {
      console.error('after-build hook failed:', e)
    }
  }
  if (!fixers.size) return
  for (const p of b.result.problems) {
    for (const f of fixers) {
      try {
        p.fixes.push(...(await f(p, b)))
      } catch (e) {
        console.error('problem fixer failed:', e)
      }
    }
  }
}
