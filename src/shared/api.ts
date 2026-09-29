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
  tree: TreeNode[]
}

export interface LogMessage {
  /** Vault-relative when the file is inside the vault, otherwise absolute. */
  file: string | null
  line: number | null
  message: string
}

export interface CompileResult {
  ok: boolean
  /** The document that was compiled (vault-relative). */
  root: string
  passes: number
  /** Absolute path of the PDF in .texcache (the one SyncTeX pairs with). */
  pdf: string | null
  errors: LogMessage[]
  durationMs: number
}

export interface Api {
  openVault(): Promise<VaultInfo | null>
  getVault(): Promise<VaultInfo | null>
  readFile(rel: string): Promise<string>
  writeFile(rel: string, text: string): Promise<void>
  compile(rel: string): Promise<CompileResult>
  readPdf(abs: string): Promise<Uint8Array>
  onTreeChanged(cb: (tree: TreeNode[]) => void): () => void
}
