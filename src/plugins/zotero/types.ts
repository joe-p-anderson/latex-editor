// Shapes the main and renderer halves pass between them. Pure.

/** What answers on the port. */
export interface ProviderStatus {
  /** Something Zotero-like answers the connector ping. */
  running: boolean
  /** Zotero's local API (`/api/`) is on. */
  localApi: boolean
  /** Better BibTeX's version, when it is installed. */
  bbt: string | null
  zotero: string | null
}

export interface EnsureResult {
  /** The keys that are now in the .bib (asked for and found). */
  keys: string[]
  /** Keys Zotero doesn't know. */
  missing: string[]
  file: string
  /** Keys written now. */
  added: string[]
  /** The file was created by this call. */
  created: boolean
}

export interface SyncResult {
  files: string[]
  updated: number
  unchanged: number
  /** Entries whose key in Zotero differs from the one in the file; left as they are. */
  renamed: string[]
  /** Entries Zotero no longer has (or couldn't export); left as they are. */
  missing: string[]
}

/** What the setup checklist shows. */
export interface Checklist {
  status: ProviderStatus
  /** Where Zotero is installed on this machine, or null when not found. */
  installed: string | null
  bib: { file: string; exists: boolean; named: string[] }
  /** Whether the document names a .bib at all (null when no document is open). */
  declared: boolean | null
}
