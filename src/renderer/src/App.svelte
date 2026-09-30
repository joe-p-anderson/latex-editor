<script lang="ts">
  import { onMount } from 'svelte'
  import type { CompileResult, EditorContext, Problem, QuickFix, TextEdit, TreeNode, VaultInfo } from '@shared/api'
  import FileTree from './lib/FileTree.svelte'
  import Editor from './lib/Editor.svelte'
  import PdfViewer from './lib/PdfViewer.svelte'
  import ProblemsPanel from './lib/ProblemsPanel.svelte'
  import ImagePicker from './lib/ImagePicker.svelte'
  import Outline from './lib/Outline.svelte'
  import TabBar from './lib/TabBar.svelte'
  import QuickOpen from './lib/QuickOpen.svelte'
  import type { EditingHooks } from './lib/editing'
  import { blankComments, parseSnippets, type OutlineItem, type Snippet } from '@shared/latexedit'
  import { includegraphics, type ImageHooks } from './lib/imageSupport'
  import { clearThumbnails } from './lib/thumbnails'
  import { isImage } from '@shared/images'
  import { renameKeyChanges, replacementChanges, searchText, type SearchMatch, type SearchOptions } from '@shared/search'
  import SearchPanel from './lib/SearchPanel.svelte'
  import PromptDialog from './lib/PromptDialog.svelte'
  import TableEditor from './lib/TableEditor.svelte'
  import { insertRow, newTable, packagesFor, parseTable, pasteGrid, serializeTable, type TableModel } from '@shared/tablemodel'
  import { normalizeEol } from '@shared/search'
  import { clearSpellingCache, type SpellHooks } from './lib/spellcheck'
  import SymbolPanel, { type LibrarySymbol, type SymbolActions } from './lib/SymbolPanel.svelte'
  import { findMathRegions, mathAtCursor } from '@shared/mathregions'
  import { BUILTIN_MATH_SNIPPETS, mathSnippetsFileTemplate, mergeSnippets, parseMathSnippets, type MathSnippet } from '@shared/mathsnippets'

  const TEXT_FILE = /\.(tex|cls|sty|bib|cfg|txt|md|json)$/i

  let vault = $state<VaultInfo | null>(null)
  let active = $state<string | null>(null)
  // Open files in tab order, and most recently used first (for Ctrl+Tab).
  let tabs = $state<string[]>([])
  let mru: string[] = []
  let quickOpen = $state(false)
  let dirty = $state(new Set<string>())
  let editor = $state<Editor>()
  let viewer = $state<PdfViewer>()

  // A short-lived message in the header (e.g. why a jump went nowhere).
  let note = $state<string | null>(null)
  let noteTimer: ReturnType<typeof setTimeout> | undefined
  function flash(msg: string): void {
    note = msg
    clearTimeout(noteTimer)
    noteTimer = setTimeout(() => (note = null), 3500)
  }

  let compiling = $state(false)
  let previewing = $state(false)
  let result = $state<CompileResult | null>(null)
  let pdf = $state<string | null>(null)
  let pdfVersion = $state(0)
  let compileSeq = 0

  // Editor share of the editor+PDF area, adjusted by dragging the splitter.
  let split = $state(0.5)
  let main = $state<HTMLDivElement>()

  $effect(() => {
    document.title = vault ? `${vault.name} — LaTeX Editor` : 'LaTeX Editor'
  })

  // The vault's images, for the picker, autocomplete and hover previews.
  let images = $state<string[]>([])
  // The picker: 'insert' puts the chosen image at the cursor; 'view' just shows images.
  let picker = $state<{ mode: 'insert' | 'view'; initial: string } | null>(null)

  async function loadImages(): Promise<void> {
    clearThumbnails() // files may have been replaced on disk
    images = vault ? await window.api.listImages() : []
  }

  const imageHooks: ImageHooks = {
    images: () => images,
    openPicker: () => (picker = { mode: 'insert', initial: '' }),
    importFiles: async (files) => {
      const rels: string[] = []
      for (const f of files) {
        const path = window.api.pathForFile(f)
        rels.push(path ? await window.api.importImage(path) : await window.api.saveImage(f.name, new Uint8Array(await f.arrayBuffer())))
      }
      await loadImages()
      return rels
    },
    savePasted: async (blob) => {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const rel = await window.api.saveImage(`pasted-${stamp}.${ext}`, new Uint8Array(await blob.arrayBuffer()))
      await loadImages()
      flash(`Saved ${rel}`)
      return rel
    },
  }

  // For the editor's list continuation and completion.
  let context: EditorContext = { commands: [], environments: [] }
  let snippets: Snippet[] = []
  let mathSnippets: MathSnippet[] = BUILTIN_MATH_SNIPPETS
  const editingHooks: EditingHooks = {
    lists: () => vault?.lists ?? {},
    commands: () => context.commands,
    environments: () => context.environments,
    snippets: () => snippets,
    mathSnippets: () => mathSnippets,
    renameLabel: (key) => (renaming = key),
    editTable: (range, grid) => editTable(range, grid),
  }

  /** Reads the vault's snippet and math shortcut files (none is fine). */
  async function loadSnippets(): Promise<void> {
    snippets = vault ? parseSnippets(await window.api.readFile(vault.snippets).catch(() => '')) : []
    const own = parseMathSnippets(vault ? await window.api.readFile(vault.mathSnippets).catch(() => '') : '')
    mathSnippets = mergeSnippets(BUILTIN_MATH_SNIPPETS, own)
    if (own.errors.length) flash(`${vault?.mathSnippets} line ${own.errors[0].line}: ${own.errors[0].message}`)
  }

  /** After saving `rel`: reload it if it's one of the vault's own settings files. */
  async function reloadIfSettings(rel: string): Promise<void> {
    if (rel === vault?.snippets || rel === vault?.mathSnippets) await loadSnippets()
    if (rel === vault?.words) {
      await window.api.reloadWords()
      clearSpellingCache()
      editor?.refreshSpellcheck()
    }
  }

  /** Edit → Math Shortcuts: opens the vault's file, creating it (with the built-ins listed) if needed. */
  async function editMathShortcuts(): Promise<void> {
    if (!vault) return
    const exists = await window.api.readFile(vault.mathSnippets).then(() => true, () => false)
    if (!exists) await window.api.writeFile(vault.mathSnippets, mathSnippetsFileTemplate())
    await openFile(vault.mathSnippets)
  }

  // The open file's outline, and where the cursor is in it.
  let outlineItems = $state<OutlineItem[]>([])
  let cursorLine = $state(1)
  // Whether the open file is in live mode (rendered) or plain source.
  let live = $state(true)

  // Spelling: on unless switched off (View → Check Spelling), remembered here.
  const SPELL_KEY = 'spellcheck'
  let spellOn = (() => {
    try {
      return localStorage.getItem(SPELL_KEY) !== 'false'
    } catch {
      return true
    }
  })()
  const spellHooks: SpellHooks = {
    enabled: () => spellOn,
    check: (words) => window.api.spellCheck(words),
    suggest: (word) => window.api.spellSuggest(word),
    add: async (word) => {
      await window.api.addWord(word)
      flash(`Added "${word}" to ${vault?.words}`)
    },
  }
  function setSpelling(on: boolean): void {
    spellOn = on
    try {
      localStorage.setItem(SPELL_KEY, String(on))
    } catch {
      // not remembered; fine
    }
    editor?.refreshSpellcheck()
  }

  function pickImage(rel: string): void {
    picker = null
    editor?.insertAtCursor(includegraphics(rel))
  }

  onMount(() => {
    window.api.getVault().then((v) => {
      vault = v
      loadImages()
      loadSnippets()
    })
    const offTree = window.api.onTreeChanged((tree) => {
      if (vault) vault.tree = tree
      loadImages()
      // A file deleted or renamed outside the app loses its tab, unless it has unsaved changes.
      const present = new Set(allFiles(tree))
      for (const rel of tabs) if (!present.has(rel) && !dirty.has(rel)) forgetTab(rel)
    })
    const offClose = window.api.onCloseRequested(async () => {
      if (await settleUnsaved('closing')) window.api.closeWindow()
    })
    const offMenu = window.api.onMenuOpenVault(openVault)
    const offVault = window.api.onVaultChanged((v) => (vault = v))
    const offAppMenu = window.api.onMenu((name, arg) => {
      if (name === 'math-shortcuts') editMathShortcuts()
      else if (name === 'spellcheck') setSpelling(arg === true)
    })
    window.api.setSpellcheckMenu(spellOn)
    return () => (offTree(), offMenu(), offVault(), offClose(), offAppMenu())
  })

  async function openVault(): Promise<void> {
    if (vault && !(await settleUnsaved('opening another vault'))) return
    const v = await window.api.openVault()
    if (!v) return
    for (const rel of tabs) editor?.close(rel)
    vault = v
    active = null
    tabs = []
    mru = []
    dirty = new Set()
    result = null
    pdf = null
    outlineItems = []
    clearSpellingCache() // another vault, another word list
    loadImages()
    loadSnippets()
  }

  async function openFile(rel: string): Promise<void> {
    if (isImage(rel)) {
      // Images open in the picker's view mode, filtered to this one.
      picker = { mode: 'view', initial: rel }
      return
    }
    if (!TEXT_FILE.test(rel)) return
    const previous = active
    await editor?.open(rel)
    active = rel
    // A new tab goes just after the one that was showing.
    if (!tabs.includes(rel)) {
      const at = previous && tabs.includes(previous) ? tabs.indexOf(previous) + 1 : tabs.length
      tabs = [...tabs.slice(0, at), rel, ...tabs.slice(at)]
    }
    if (!cycling) mru = [rel, ...mru.filter((r) => r !== rel)]
    loadMacros(rel)
  }

  /** Every file in the tree, vault-relative. */
  function allFiles(nodes: TreeNode[]): string[] {
    return nodes.flatMap((n) => (n.kind === 'dir' ? allFiles(n.children ?? []) : [n.rel]))
  }

  const COMPILES = /\.(tex|cls|sty|cfg)$/i

  /** Writes every unsaved file, then compiles once. */
  async function saveAll(): Promise<void> {
    if (!editor) return
    const texts = editor.dirtyTexts()
    for (const [rel, text] of texts) {
      await window.api.writeFile(rel, text)
      editor.markSaved(rel, text)
      await reloadIfSettings(rel)
    }
    if (texts.size) flash(`Saved ${texts.size} file${texts.size === 1 ? '' : 's'}`)
    const target = active && COMPILES.test(active) ? active : [...texts.keys()].find((r) => COMPILES.test(r))
    if (target) await compile(target)
  }

  /**
   * Before closing or switching vaults: if files are unsaved, asks whether
   * to save them. Returns false if the user cancelled.
   */
  async function settleUnsaved(action: string): Promise<boolean> {
    const texts = editor?.dirtyTexts() ?? new Map<string, string>()
    if (!texts.size) return true
    const answer = await window.api.askAboutUnsaved([...texts.keys()], action)
    if (answer === 'cancel') return false
    if (answer === 'save') await saveAll()
    return true
  }

  /** Removes a tab without asking, showing a neighbour if it was the open file. */
  function forgetTab(rel: string): void {
    const i = tabs.indexOf(rel)
    tabs = tabs.filter((t) => t !== rel)
    mru = mru.filter((t) => t !== rel)
    setDirty(rel, false)
    editor?.close(rel)
    if (active === rel) {
      active = null
      outlineItems = []
      const next = mru[0] ?? tabs[Math.max(0, Math.min(i, tabs.length - 1))]
      if (next) openFile(next)
    }
  }

  /** Closes a tab, offering to save it first. */
  async function closeTab(rel: string): Promise<void> {
    if (dirty.has(rel)) {
      const answer = await window.api.askAboutUnsaved([rel], 'closing')
      if (answer === 'cancel') return
      const text = editor?.textOf(rel)
      if (answer === 'save' && text != null) {
        await window.api.writeFile(rel, text)
        await reloadIfSettings(rel)
      }
    }
    forgetTab(rel)
  }

  function moveTab(from: number, to: number): void {
    const next = [...tabs]
    const [t] = next.splice(from, 1)
    next.splice(to, 0, t)
    tabs = next
  }

  // Ctrl+Tab walks the most-recently-used list while Ctrl is held; letting
  // go of Ctrl makes the file it landed on the most recent.
  let cycling = false
  let cycleAt = 0
  function cycle(step: number): void {
    if (mru.length < 2) return
    if (!cycling) {
      cycling = true
      cycleAt = 0
    }
    cycleAt = (cycleAt + step + mru.length) % mru.length
    openFile(mru[cycleAt])
  }
  function endCycle(): void {
    if (!cycling) return
    cycling = false
    if (active) mru = [active, ...mru.filter((r) => r !== active)]
  }

  /** App-wide keys, caught before the editor sees them. */
  function onkeydown(e: KeyboardEvent): void {
    if (!vault || !e.ctrlKey || e.metaKey) return
    const key = e.key.toLowerCase()
    const plain = !e.shiftKey && !e.altKey
    let handled = true
    if (key === 'tab') cycle(e.shiftKey ? -1 : 1)
    else if ((key === 'pageup' || key === 'pagedown') && plain) {
      const i = active ? tabs.indexOf(active) : -1
      if (tabs.length) openFile(tabs[(i + (key === 'pagedown' ? 1 : -1) + tabs.length) % tabs.length])
    } else if (key === 'w' && plain) {
      if (active) closeTab(active)
    } else if (key === 'p' && plain) quickOpen = true
    else if (key === 's' && e.altKey && !e.shiftKey) saveAll()
    else if (key === 'h' && e.shiftKey && !e.altKey) openSearch()
    else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
  function onkeyup(e: KeyboardEvent): void {
    if (e.key === 'Control') endCycle()
  }

  // Quick open lists text files and images.
  const openable = $derived(vault ? allFiles(vault.tree).filter((f) => TEXT_FILE.test(f) || isImage(f)) : [])

  /**
   * Gives the math preview the macros of the document `rel` belongs to, and
   * completion its commands and environments.
   */
  async function loadMacros(rel: string): Promise<void> {
    if (!rel.endsWith('.tex')) return
    const [{ macros }, ctx] = await Promise.all([
      window.api.mathMacros(rel).catch(() => ({ macros: {} })),
      window.api.editorContext(rel).catch(() => null),
    ])
    if (rel !== active) return
    editor?.setMacros(macros)
    if (ctx) context = ctx
  }

  // A class file open from the vault gets a banner offering to move it to the
  // global template folder. "Not now" hides it for that file until the app
  // restarts, so a new template can be worked on in place first.
  let keptInVault = $state(new Set<string>())
  const offerMove = $derived(!!active && active.toLowerCase().endsWith('.cls') && !keptInVault.has(active))

  async function moveActiveToGlobal(): Promise<void> {
    const rel = active
    if (!rel || !editor) return
    if (dirty.has(rel)) await window.api.writeFile(rel, editor.currentText())
    const to = await window.api.moveToGlobalTemplates(rel).catch((e: Error) => (flash(`Couldn't move ${rel}: ${e.message}`), null))
    if (!to) return
    forgetTab(rel)
    flash(`Moved to ${to}`)
  }

  function setDirty(rel: string, isDirty: boolean): void {
    if (isDirty === dirty.has(rel)) return
    if (isDirty) dirty.add(rel)
    else dirty.delete(rel)
    dirty = new Set(dirty)
  }

  // --- Vault-wide search, replace and label rename -------------------------

  let sidebar = $state<'files' | 'search' | 'symbols'>('files')
  let searchPanel = $state<SearchPanel>()
  // Bumped when files change, so the search panel searches again.
  let searchVersion = $state(0)
  let renaming = $state<string | null>(null)

  // --- Table editor ---------------------------------------------------------

  /** The table being edited: where it is (`from` = `to` for a new one) and its model. */
  let tableEdit = $state<{ rel: string; from: number; to: number; source: string; model: TableModel; startRow: number; isNew: boolean } | null>(null)

  /**
   * Opens the table editor on the table at `range` in the open file, or a
   * new table at the cursor. Pasted spreadsheet cells (`grid`) go in after
   * the cursor's row of an existing table, or fill a new one.
   */
  function editTable(range: { from: number; to: number } | null, grid: string[][] | null): void {
    if (!editor || !active) return
    const text = editor.docText()
    if (range) {
      const source = text.slice(range.from, range.to)
      const model = parseTable(source)
      if (model) {
        let m = model
        let startRow = 0
        if (grid) {
          // Which row the cursor is in: the \\ row ends before it (after the tabular's own start).
          const tab = source.search(/\\begin\s*\{tabular/)
          const before = text.slice(range.from + Math.max(0, tab), editor.cursorPos())
          const at = editor.cursorPos() < range.from + tab ? m.rows.length : Math.min((before.match(/\\\\/g) ?? []).length + 1, m.rows.length)
          for (let i = 0; i < grid.length; i++) m = insertRow(m, at)
          m = pasteGrid(m, at, 0, grid)
          startRow = at
        }
        tableEdit = { rel: active, ...range, source, model: m, startRow, isNew: false }
        return
      }
      flash("This table has comments or a layout the table editor can't show; edit it as source")
      if (!grid) return
    }
    const pos = editor.cursorPos()
    const empty = [['', '', ''], ['', '', ''], ['', '', '']]
    tableEdit = { rel: active, from: pos, to: pos, source: '', model: newTable(grid ?? empty), startRow: 0, isNew: true }
  }

  async function applyTable(model: TableModel): Promise<void> {
    const t = tableEdit
    tableEdit = null
    if (!t || !editor) return
    if (active !== t.rel) await openFile(t.rel)
    const text = editor.docText()
    if (!t.isNew && text.slice(t.from, t.to) !== t.source) return flash("The table changed while the editor was open; nothing was applied")
    const lineStart = text.lastIndexOf('\n', t.from - 1) + 1
    const lead = text.slice(lineStart, t.from)
    const indent = /^[ \t]*$/.test(lead) ? lead : (/^[ \t]*/.exec(lead)?.[0] ?? '')
    const out = serializeTable(model, indent)
    if (t.isNew) editor.insertBlock(out)
    else editor.replaceRange(t.from, t.to, /^[ \t]*$/.test(lead) ? out.slice(indent.length) : out)
    await ensurePackages(packagesFor(model))
  }

  /** A package to load, with options only where they matter (\usepackage[T1]{fontenc}). */
  type PackageSpec = string | { name: string; options: string }

  /**
   * The packages of `pkgs` the open document doesn't load yet (itself, or
   * through its class, per the last build's log), and the document to add
   * them to; null when there's no document.
   */
  async function missingPackages(pkgs: PackageSpec[]): Promise<{ root: string; text: string; missing: PackageSpec[] } | null> {
    if (!active) return null
    const own = normalizeEol((await textOf(active)) ?? '')
    const root = /^[^%\n]*\\documentclass/m.test(own) ? active : result?.root
    if (!root) return null
    const text = root === active ? own : normalizeEol(await textOf(root))
    const log = result?.root === root ? result.log : ''
    const loads = (p: PackageSpec) => {
      if (typeof p !== 'string') {
        // Font encodings: \usepackage[T1]{fontenc} writes t1enc.def into the log.
        return new RegExp(String.raw`[\\/]${p.options.toLowerCase()}enc\.def`, 'i').test(log) || new RegExp(String.raw`\\usepackage\s*\[[^\]]*\b${p.options}\b[^\]]*\]\s*\{${p.name}\}`).test(text)
      }
      return new RegExp(String.raw`[\\/]${p}\.sty`).test(log) || new RegExp(String.raw`\\(usepackage|RequirePackage)\s*(\[[^\]]*\])?\s*\{[^}]*\b${p}\b`).test(text)
    }
    return { root, text, missing: pkgs.filter((p) => !loads(p)) }
  }

  /**
   * Adds the \usepackage lines for `pkgs` to the document's preamble, unless
   * the document (or its class, per the last build's log) loads them.
   */
  async function ensurePackages(pkgs: PackageSpec[]): Promise<void> {
    if (!pkgs.length) return
    const found = await missingPackages(pkgs)
    if (!found || !found.missing.length) return
    const { root, text, missing } = found
    const line = (p: PackageSpec) => (typeof p === 'string' ? `\\usepackage{${p}}` : `\\usepackage[${p.options}]{${p.name}}`)
    const begin = text.search(/^[^%\n]*\\begin\s*\{document\}/m)
    const preamble = begin < 0 ? text : text.slice(0, begin)
    const uses = [...preamble.matchAll(/^[^%\n]*\\usepackage.*$/gm)]
    const cls = /^[^%\n]*\\documentclass.*$/m.exec(preamble)
    const anchor = uses.at(-1) ?? cls
    if (!anchor) return
    const at = anchor.index! + anchor[0].length
    await editor?.applyChangesTo(root, [{ from: at, to: at, insert: missing.map((p) => `\n${line(p)}`).join('') }])
    addTab(root)
    flash(`Added ${missing.map(line).join(', ')} to ${root.split('/').pop()}`)
  }

  // --- Symbols ----------------------------------------------------------------

  // textcomp has been part of LaTeX itself since 2020, so it's never added.
  const symbolPackages = (s: LibrarySymbol): PackageSpec[] => [
    ...(s.fontenc ? [{ name: 'fontenc', options: s.fontenc }] : []),
    ...(s.package && s.package !== 'textcomp' ? [s.package] : []),
  ]

  /**
   * The packages and font encodings the open document loads: its own
   * \usepackage lines, and (from the last build's log) what its class
   * loads. Null when no document is open.
   */
  async function loadedPackages(): Promise<{ packages: Set<string>; encodings: Set<string> } | null> {
    if (!active) return null
    const own = normalizeEol((await textOf(active).catch(() => '')) ?? '')
    const root = /^[^%\n]*\\documentclass/m.test(own) ? active : result?.root
    if (!root) return null
    const text = root === active ? own : normalizeEol(await textOf(root).catch(() => ''))
    const log = result?.root === root ? result.log : ''
    const packages = new Set<string>()
    const encodings = new Set<string>()
    for (const m of blankComments(text).matchAll(/\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g)) {
      for (const name of m[2].split(',')) packages.add(name.trim())
      if (m[2].includes('fontenc')) for (const o of (m[1] ?? '').split(',')) encodings.add(o.trim().toUpperCase())
    }
    for (const m of log.matchAll(/[\\/]([A-Za-z0-9-]+)\.sty\b/g)) packages.add(m[1])
    for (const m of log.matchAll(/[\\/]([A-Za-z0-9]+)enc\.def\b/gi)) encodings.add(m[1].toUpperCase())
    return { packages, encodings }
  }

  const symbolActions: SymbolActions = {
    insert(s) {
      if (!editor || !active) return flash('Open a document to insert a symbol')
      // A math symbol in text goes in $…$; a text symbol in math, in \text{…}.
      const text = editor.docText()
      const pos = editor.cursorPos()
      const math = !!mathAtCursor(text, findMathRegions(text), pos)
      let insert = s.mode === 'math' && !math ? `$${s.command}$` : s.mode === 'text' && math ? `\\text{${s.command}}` : s.command
      // \alpha straight before a letter would run into it.
      if (/[A-Za-z]$/.test(insert) && /^[A-Za-z]/.test(text.slice(pos, pos + 1))) insert += ' '
      editor.insertAtCursor(insert)
      editor.focus()
      // And what it needs, if the document doesn't load it yet.
      if (s.package || s.fontenc) ensurePackages(symbolPackages(s))
    },
    addPackage: (s) => ensurePackages(symbolPackages(s)),
    hasPackage: async (s) => ((await missingPackages(symbolPackages(s)))?.missing.length ?? 1) === 0,
    loadedPackages,
    note: (message) => flash(message),
  }

  /** Unsaved buffers, which search reads instead of the disk copies. */
  const overrides = () => Object.fromEntries(editor?.dirtyTexts() ?? [])

  function openSearch(): void {
    sidebar = 'search'
    searchPanel?.focusWith(editor?.selectedText() ?? '')
  }

  /** Adds a tab for `rel` without switching to it. */
  function addTab(rel: string): void {
    if (!tabs.includes(rel)) tabs = [...tabs, rel]
  }

  const textOf = async (rel: string) => editor?.textOf(rel) ?? (await window.api.readFile(rel))

  async function openMatch(rel: string, m: SearchMatch): Promise<void> {
    await openFile(rel)
    editor?.select(m.from, m.to)
  }

  /**
   * Replaces matches of the search, searching each file's current text again
   * first (it may have changed since the results were shown). The changed
   * files open as unsaved tabs; each is one undoable change.
   */
  async function replaceMatches(query: string, opts: SearchOptions, replacement: string, files: string[] | null, one?: SearchMatch): Promise<void> {
    const targets = files ?? (await window.api.search(query, opts, overrides())).files.map((f) => f.rel)
    let count = 0
    let changed = 0
    for (const rel of targets) {
      let matches = searchText(await textOf(rel), query, opts)
      if (one) matches = matches.filter((m) => m.from === one.from && m.to === one.to)
      if (!matches.length) continue
      await editor?.applyChangesTo(rel, replacementChanges(matches, replacement))
      addTab(rel)
      count += matches.length
      changed++
    }
    searchVersion++
    if (one && targets[0]) await openFile(targets[0])
    else if (count) flash(`Replaced ${count} in ${changed} file${changed === 1 ? '' : 's'}, unsaved. Ctrl+Alt+S saves all`)
  }

  /** F2: renames a label, and every reference to it, across the vault. */
  async function renameLabel(from: string, to: string): Promise<void> {
    renaming = null
    to = to.trim()
    if (!to || to === from) return
    if (/[\s{}\\%#,]/.test(to)) return flash(`"${to}" can't be a label: no spaces, braces, commas, \\, % or #`)
    const literal: SearchOptions = { regex: false, caseSensitive: true, wholeWord: false, includeComments: true }
    const exists = (await window.api.search(`{${to}}`, literal, overrides())).files.length > 0
    if (exists) return flash(`A label or reference "${to}" already exists`)
    const hits = await window.api.search(from, literal, overrides())
    let count = 0
    let changed = 0
    for (const { rel } of hits.files) {
      const changes = renameKeyChanges(await textOf(rel), from, to)
      if (!changes.length) continue
      await editor?.applyChangesTo(rel, changes)
      addTab(rel)
      count += changes.length
      changed++
    }
    searchVersion++
    flash(`Renamed ${from} → ${to}: ${count} place${count === 1 ? '' : 's'} in ${changed} file${changed === 1 ? '' : 's'}, unsaved`)
  }

  async function save(rel: string, text: string): Promise<void> {
    await window.api.writeFile(rel, text)
    searchVersion++
    await reloadIfSettings(rel)
    if (COMPILES.test(rel)) await compile(rel)
  }

  async function compile(rel: string): Promise<void> {
    clearTimeout(previewTimer) // this build includes whatever the preview would have
    const seq = ++compileSeq
    compiling = true
    previewing = false
    try {
      const r = await window.api.compile(rel)
      if (seq !== compileSeq) return // a newer save superseded this compile
      show(r)
    } finally {
      if (seq === compileSeq) compiling = false
    }
  }

  function show(r: CompileResult): void {
    result = r
    editor?.setProblems(r.problems)
    if (active) loadMacros(active) // the preamble or a template may have changed
    if (r.pdf) {
      pdf = r.pdf
      pdfVersion++
    }
  }

  // Preview: a pause in typing builds the unsaved text (without saving it)
  // so the PDF keeps up. Ctrl+S still saves and publishes to pdf/.
  const PREVIEW_DELAY_MS = 1200
  let previewTimer: ReturnType<typeof setTimeout> | undefined
  function schedulePreview(rel: string): void {
    if (!COMPILES.test(rel)) return
    clearTimeout(previewTimer)
    previewTimer = setTimeout(() => preview(rel), PREVIEW_DELAY_MS)
  }

  async function preview(rel: string): Promise<void> {
    if (!editor) return
    // A saved build is running: try again after it, which may make this unnecessary.
    if (compiling) return schedulePreview(rel)
    const buffers = Object.fromEntries(editor.dirtyTexts())
    // Nothing unsaved, and the PDF already shows the saved files.
    if (!Object.keys(buffers).length && !result?.draft) return
    const seq = ++compileSeq
    previewing = true
    try {
      const r = await window.api.compileDraft(rel, buffers)
      if (seq !== compileSeq || !r) return
      show(r)
    } finally {
      if (seq === compileSeq) previewing = false
    }
  }

  const outsideVault = (file: string) => /^[a-zA-Z]:|^\//.test(file)

  async function jumpTo(p: Problem): Promise<void> {
    if (!p.file) return
    if (outsideVault(p.file)) {
      flash(`That's in ${p.file.split(/[\\/]/).pop()}, outside this vault`)
      return
    }
    await openFile(p.file)
    if (p.line) editor?.gotoLine(p.line)
  }

  /**
   * Applies a quick fix: each file's edits go in as one undoable change, the
   * file is saved, and the save recompiles as usual. Ctrl+Z undoes it.
   */
  async function applyFix(fix: QuickFix): Promise<void> {
    const byFile = new Map<string, TextEdit[]>()
    for (const e of fix.edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e])
    for (const [file, edits] of byFile) {
      if (outsideVault(file)) {
        flash(`Can't apply: ${file.split(/[\\/]/).pop()} is outside this vault`)
        return
      }
      await openFile(file)
      if (!editor?.applyEdits(edits)) {
        flash(`Couldn't apply "${fix.label}": the text has changed since the last compile`)
        return
      }
      editor.saveCurrent()
    }
  }

  /** Source → PDF: highlight where the cursor's line appears. */
  async function syncForward(): Promise<void> {
    if (!pdf || !active || !editor) return
    const target = await window.api.syncForward(pdf, active, editor.cursorLine())
    if (target) viewer?.show(target)
    else flash(`${active} isn't part of the PDF being shown`)
  }

  /** PDF → source: open the file and line behind a double-clicked point. */
  async function syncInverse(page: number, x: number, y: number): Promise<void> {
    if (!pdf) return
    const loc = await window.api.syncInverse(pdf, page, x, y)
    if (!loc) return
    if (/^[a-zA-Z]:|^\//.test(loc.file)) {
      flash(`That comes from ${loc.file.split(/[\\/]/).pop()}:${loc.line}, outside this vault`)
      return
    }
    await openFile(loc.file)
    editor?.gotoLine(loc.line)
  }

  function startDrag(ev: PointerEvent): void {
    const target = ev.currentTarget as HTMLElement
    target.setPointerCapture(ev.pointerId)
    const box = main!.getBoundingClientRect()
    const move = (m: PointerEvent) => (split = Math.min(0.8, Math.max(0.2, (m.clientX - box.left) / box.width)))
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', () => target.removeEventListener('pointermove', move), { once: true })
  }
</script>

<svelte:window onkeydowncapture={onkeydown} {onkeyup} onblur={endCycle} />

{#if !vault}
  <div class="welcome">
    <h1>LaTeX Editor</h1>
    <p>Open a folder of LaTeX documents, such as a course's <code>latex/</code> folder.</p>
    <button onclick={openVault}>Open vault…</button>
  </div>
{:else}
  <div class="app">
    <header>
      <strong>{vault.name}</strong>
      <span class="file">{active ?? ''}</span>
      <span class="spacer"></span>
      {#if note}<span class="note">{note}</span>{/if}
      <button
        class="toggle"
        class:on={live}
        disabled={!active}
        onclick={() => editor?.toggleLiveMode()}
        title={live ? 'Live view: showing the document rendered. Click for plain source (Ctrl+Shift+L)' : 'Plain source. Click for the live view (Ctrl+Shift+L)'}
        >{live ? 'Live' : 'Source'}</button
      >
      <button disabled={!active?.endsWith('.tex')} onclick={() => (picker = { mode: 'insert', initial: '' })} title="Insert an image from the vault (or type ![[ in the editor)">Insert image</button>
      <button disabled={!pdf || !active} onclick={syncForward} title="Show the cursor's line in the PDF (Ctrl+J)">Show in PDF →</button>
      {#if compiling}
        <span class="status">Compiling…</span>
      {:else if previewing}
        <span class="status" title="Building your unsaved text. Ctrl+S saves and updates pdf/">Previewing…</span>
      {:else if result}
        {@const errors = result.problems.filter((p) => p.severity === 'error' && !p.hidden && !p.followOn).length}
        {@const warnings = result.problems.filter((p) => p.severity === 'warning' && !p.hidden).length}
        {@const how = `${result.draft ? 'Preview of unsaved text: pdf/ is updated when you save. ' : ''}${result.passes} pass${result.passes === 1 ? '' : 'es'}${result.preloaded ? ', preamble preloaded' : ''}`}
        {#if errors}
          <span class="status err" title={how}>✗ {errors} error{errors === 1 ? '' : 's'} in {result.root}{result.draft ? ' (preview)' : ''}</span>
        {:else}
          <span class="status ok" title={how}>
            ✓ {#if result.draft}<span class="preview">preview</span>{/if}{result.root} · {(result.durationMs / 1000).toFixed(1)} s{#if warnings}<span class="warn"> · {warnings} warning{warnings === 1 ? '' : 's'}</span>{/if}
          </span>
        {/if}
      {/if}
      <button disabled={!active || compiling} onclick={() => active && compile(active)}>Recompile</button>
    </header>

    <aside>
      <div class="side-tabs">
        <button class:on={sidebar === 'files'} onclick={() => (sidebar = 'files')}>Files</button>
        <button class:on={sidebar === 'search'} onclick={openSearch} title="Search the vault (Ctrl+Shift+H)">Search</button>
        <button class:on={sidebar === 'symbols'} onclick={() => (sidebar = 'symbols')} title="Symbol library, and draw a symbol to find it">Symbols</button>
      </div>
      <!-- Both stay mounted, so the search keeps its query and results. -->
      <div class="side-body" hidden={sidebar !== 'files'}>
        <div class="tree"><FileTree nodes={vault.tree} {active} {dirty} onopen={openFile} /></div>
        {#if active?.endsWith('.tex')}
          <div class="outline"><Outline items={outlineItems} {cursorLine} onjump={(line) => editor?.gotoLine(line)} /></div>
        {/if}
      </div>
      <div class="side-body" hidden={sidebar !== 'search'}>
        <SearchPanel
          bind:this={searchPanel}
          search={(q, o) => window.api.search(q, o, overrides())}
          version={searchVersion}
          onopen={openMatch}
          onreplace={replaceMatches}
        />
      </div>
      <div class="side-body" hidden={sidebar !== 'symbols'}>
        <SymbolPanel actions={symbolActions} active={sidebar === 'symbols'} docKey="{active}|{pdfVersion}|{searchVersion}|{result?.root}" />
      </div>
    </aside>

    <div class="main" bind:this={main} style:grid-template-columns="{split}fr 6px {1 - split}fr">
      <section class="editor-pane">
        {#if offerMove && active}
          {@const file = active.split('/').pop()}
          <div class="banner">
            <span>
              <strong>{file}</strong> is a template. Move it to the global template folder so every vault can use it?
              {#if vault.globalTemplates}<span class="where" title={vault.globalTemplates}>{vault.globalTemplates}</span>{/if}
            </span>
            <span class="spacer"></span>
            <button onclick={moveActiveToGlobal}>Move</button>
            <button onclick={() => (keptInVault = new Set(keptInVault).add(active!))} title="Keep editing it here; asked again next time the app starts">Not now</button>
          </div>
        {/if}
        <TabBar {tabs} {active} {dirty} onselect={openFile} onclose={closeTab} onmove={moveTab} />
        <div class="editor">
          <Editor
            bind:this={editor}
            onsave={save}
            ondirtychange={setDirty}
            onsyncforward={syncForward}
            {imageHooks}
            {editingHooks}
            {spellHooks}
            onoutline={(items) => (outlineItems = items)}
            oncursorline={(line) => (cursorLine = line)}
            onlivechange={(on) => (live = on)}
            onedit={schedulePreview}
          />
        </div>
        {#if !active}<p class="hint">Pick a file on the left.</p>{/if}
        {#if result}<ProblemsPanel {result} onjump={jumpTo} onfix={applyFix} />{/if}
      </section>
      <div class="splitter" role="separator" aria-orientation="vertical" onpointerdown={startDrag}></div>
      <section class="pdf-pane"><PdfViewer bind:this={viewer} {pdf} version={pdfVersion} onsyncclick={syncInverse} /></section>
    </div>
  </div>
{/if}

{#if tableEdit && editor}
  <TableEditor
    initial={tableEdit.model}
    title={tableEdit.isNew ? 'New table' : 'Edit table'}
    render={editor.mathRenderer()}
    startRow={tableEdit.startRow}
    onapply={applyTable}
    oncancel={() => {
      tableEdit = null
      editor?.focus()
    }}
  />
{/if}

{#if renaming}
  {@const from = renaming}
  <PromptDialog
    title="Rename label {from}"
    initial={from}
    hint="Changes the \label and every reference to it in the vault. The files are left unsaved."
    onsubmit={(to) => renameLabel(from, to)}
    oncancel={() => {
      renaming = null
      editor?.focus()
    }}
  />
{/if}

{#if quickOpen}
  <QuickOpen
    files={openable}
    onpick={(rel) => {
      quickOpen = false
      openFile(rel)
    }}
    onclose={() => {
      quickOpen = false
      editor?.focus()
    }}
  />
{/if}

{#if picker}
  <ImagePicker
    {images}
    initial={picker.initial}
    title={picker.mode === 'insert' ? 'Insert image' : 'Images in this vault'}
    onpick={picker.mode === 'insert' ? pickImage : undefined}
    onclose={() => {
      picker = null
      editor?.focus() // so typing continues where it left off
    }}
  />
{/if}

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
  }
  .welcome h1 {
    margin: 0;
    font-weight: 600;
  }
  .welcome button {
    font-size: 15px;
    padding: 8px 20px;
  }

  .app {
    display: grid;
    grid-template-columns: 240px 1fr;
    grid-template-rows: auto 1fr;
    height: 100%;
  }
  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  header .file {
    color: var(--muted);
  }
  .spacer {
    flex: 1;
  }
  .status {
    color: var(--muted);
  }
  .note {
    color: #9a6700;
    background: #fff8c5;
    border-radius: 4px;
    padding: 2px 8px;
  }
  .toggle {
    min-width: 64px;
  }
  .toggle.on {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .status.ok {
    color: var(--ok);
  }
  .status.err {
    color: var(--err);
    font-weight: 600;
  }

  aside {
    border-right: 1px solid var(--border);
    background: var(--panel);
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .side-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .side-tabs button {
    flex: 1;
    border: none;
    border-radius: 0;
    background: none;
    padding: 5px 0;
    color: var(--muted);
  }
  .side-tabs button.on {
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .side-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .side-body[hidden] {
    display: none;
  }
  .tree {
    flex: 1 1 55%;
    min-height: 0;
  }
  .outline {
    flex: 1 1 45%;
    min-height: 0;
    border-top: 1px solid var(--border);
  }

  .main {
    display: grid;
    min-height: 0;
    min-width: 0;
  }
  .editor-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    position: relative;
  }
  .editor {
    flex: 1;
    min-height: 0;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    color: #0a3069;
    background: #ddf4ff;
    border-bottom: 1px solid #54aeff66;
  }
  .banner .where {
    display: block;
    color: var(--muted);
    font-size: 12px;
  }
  .hint {
    position: absolute;
    top: 40%;
    width: 100%;
    text-align: center;
    color: var(--muted);
  }
  .status .preview {
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 4px;
    margin-right: 4px;
  }
  .status .warn {
    color: #9a6700;
  }
  .splitter {
    cursor: col-resize;
    background: var(--border);
  }
  .splitter:hover {
    background: var(--accent);
  }
  .pdf-pane {
    min-width: 0;
    min-height: 0;
  }
</style>
