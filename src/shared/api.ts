import type { MacroDefs } from './mathrender'

// Types shared by the main process, the preload bridge and the renderer.
// Paths called `rel` are vault-relative with forward slashes; paths called
// `abs` are absolute filesystem paths.

export interface TreeNode {
  name: string
  rel: string
  kind: 'dir' | 'file'
  children?: TreeNode[]
}

export interface VaultInfo {
  root: string
  name: string
  /** Absolute path of the shared template library, if one is configured. */
  templates: string | null
  /** Vault-relative folder where imported and pasted images go. */
  imagesDir: string
  tree: TreeNode[]
}

export type Severity = 'error' | 'warning' | 'layout'

/**
 * One text change. `find` is located on `line` (1-based) of `file`; when it
 * occurs more than once, the occurrence starting nearest column `near` wins.
 * With `append`, the text is added at the end of the file instead.
 * `replace` may contain \n, which becomes the file's own line break.
 */
export type TextEdit =
  | { file: string; line: number; find: string; replace: string; near?: number }
  | { file: string; append: string }

export interface QuickFix {
  label: string
  edits: TextEdit[]
}

/** A diagnosed log message: what went wrong, in plain words, and how to fix it. */
export interface Problem {
  /** Which rule produced it, e.g. "undefined-command". */
  rule: string
  severity: Severity
  /** Vault-relative when inside the vault, otherwise absolute. */
  file: string | null
  line: number | null
  title: string
  explanation?: string
  fixes: QuickFix[]
  /** Other places involved, e.g. where a mismatched environment was opened. */
  related?: { file: string; line: number; label: string }[]
  /** Probably caused by an earlier error; fixing that one may clear this. */
  followOn?: boolean
  /** Noise (font substitutions, rerun notices): shown only on request. */
  hidden?: boolean
  /** TeX's own words: the log lines this came from. */
  tex: string
}

export interface CompileResult {
  ok: boolean
  /** The document that was compiled (vault-relative). */
  root: string
  passes: number
  /** Absolute path of the PDF in .texcache (the one SyncTeX pairs with). */
  pdf: string | null
  problems: Problem[]
  /** The full log of the last pass, for the raw view. */
  log: string
  durationMs: number
}

/** A rectangle on a PDF page, in PDF points from the page's top-left corner. */
export interface PdfRect {
  x: number
  y: number
  w: number
  h: number
}

export interface SyncTarget {
  page: number
  rects: PdfRect[]
}

export interface SourceLocation {
  /** Vault-relative when inside the vault, otherwise absolute (e.g. a template). */
  file: string
  line: number
}

export interface Api {
  openVault(): Promise<VaultInfo | null>
  getVault(): Promise<VaultInfo | null>
  readFile(rel: string): Promise<string>
  writeFile(rel: string, text: string): Promise<void>
  compile(rel: string): Promise<CompileResult>
  readPdf(abs: string): Promise<Uint8Array>
  /** Source line → where it appears in `pdf`. */
  syncForward(pdf: string, rel: string, line: number): Promise<SyncTarget | null>
  /** Point on a PDF page → the source line that produced it. */
  syncInverse(pdf: string, page: number, x: number, y: number): Promise<SourceLocation | null>
  /** Macros (MathJax format) for previewing math in `rel`, and the files they came from. */
  mathMacros(rel: string): Promise<{ macros: MacroDefs; sources: string[] }>
  /** Every image in the vault, vault-relative. */
  listImages(): Promise<string[]>
  /** Copies an image from outside the vault into its image folder (or returns its path if inside). */
  importImage(sourcePath: string): Promise<string>
  /** Saves image bytes (a pasted screenshot) into the image folder. */
  saveImage(name: string, bytes: Uint8Array): Promise<string>
  /** Filesystem path of a dropped File, or '' if it has none. */
  pathForFile(file: File): string
  onTreeChanged(cb: (tree: TreeNode[]) => void): () => void
}
