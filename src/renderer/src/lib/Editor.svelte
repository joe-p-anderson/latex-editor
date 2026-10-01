<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView, basicSetup } from 'codemirror'
  import { Compartment, EditorState, Prec, type StateEffect } from '@codemirror/state'
  import { keymap } from '@codemirror/view'
  import { indentWithTab } from '@codemirror/commands'
  import { StreamLanguage } from '@codemirror/language'
  import { stex } from '@codemirror/legacy-modes/mode/stex'
  import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint'
  import type { Problem, TextEdit } from '@shared/api'
  import { locateOnLine } from '@shared/edits'
  import { createRenderer, type MacroDefs } from '@shared/mathrender'
  import { mathPreview, refreshMath, type RenderFn } from './mathPreview'
  import { imageSupport, insertAt, type ImageHooks } from './imageSupport'
  import { latexEditing, type EditingHooks } from './editing'
  import { refreshSpelling, spellcheck, type SpellHooks } from './spellcheck'
  import { outline, type OutlineItem } from '@shared/latexedit'
  import { liveMode, isLive, liveFile, setLive, toggleLive, type LivePaper } from './live/live'
  import { EDIT_TABLE_EVENT } from './live/widgets'
  import { tableRangeAt } from '@shared/tablemodel'
  import { OPEN_LOCATION_EVENT, type OpenLocation } from './citations'
  import { endleafEditorTheme } from './editorTheme'

  let {
    onsave,
    ondirtychange,
    onsyncforward,
    imageHooks,
    editingHooks,
    spellHooks,
    onoutline,
    oncursor,
    onlivechange,
    onedit,
    onopenlocation,
    livePaper,
  }: {
    onsave: (rel: string, text: string) => void
    ondirtychange: (rel: string, dirty: boolean) => void
    /** Ctrl+Alt+J: show the cursor's line in the PDF. */
    onsyncforward: () => void
    /** Image picker, autocomplete, hover previews, drop and paste. */
    imageHooks: ImageHooks
    /** List markers, the document's commands and the vault's snippets. */
    editingHooks: EditingHooks
    /** Spelling: whether it's on, and the checker in the main process. */
    spellHooks: SpellHooks
    /** The open file's sections and questions, after each (debounced) change. */
    onoutline: (items: OutlineItem[]) => void
    /** 1-based line and column of the cursor, when it moves. */
    oncursor: (line: number, col: number) => void
    /** Live mode was turned on or off (or a file with the other setting was opened). */
    onlivechange: (live: boolean) => void
    /** The open file's text changed (typing, undo, a quick fix). */
    onedit: (rel: string) => void
    /** Ctrl+click on a citation (open its entry), a ref to another file, or an \input card. */
    onopenlocation: (loc: OpenLocation) => void
    /** A file's place in its multi-part paper, for the live view's numbers and cards. */
    livePaper: (rel: string | null) => LivePaper | null
  } = $props()

  let host: HTMLDivElement
  let view: EditorView
  let current: string | null = null

  // One EditorState per opened file, so switching files keeps each file's
  // cursor, scroll and undo history. `saved` is the text as last written to
  // disk, for the unsaved-changes dot.
  const states = new Map<string, EditorState>()
  const saved = new Map<string, string>()
  // Where each file was scrolled to, so switching back returns there.
  const scrolls = new Map<string, StateEffect<unknown>>()

  const latex = StreamLanguage.define(stex)
  // Which file a state holds, for the live view's place in the paper; changed on rename.
  const fileName = new Compartment()

  // Problems from the last compile, by vault-relative file, shown as
  // squiggles and gutter markers in whichever file is open.
  let problemsByFile = new Map<string, Problem[]>()

  // The math preview's renderer, rebuilt when the document's macros change.
  let render: RenderFn = createRenderer()
  let macrosKey = '{}'
  const preview = mathPreview(() => render)
  const images = imageSupport({
    images: () => imageHooks.images(),
    openPicker: () => imageHooks.openPicker(),
    importFiles: (files) => imageHooks.importFiles(files),
    savePasted: (blob) => imageHooks.savePasted(blob),
  })
  const editing = latexEditing({
    lists: () => editingHooks.lists(),
    commands: () => editingHooks.commands(),
    environments: () => editingHooks.environments(),
    snippets: () => editingHooks.snippets(),
    mathSnippets: () => editingHooks.mathSnippets(),
    renameLabel: (key) => editingHooks.renameLabel(key),
    editTable: (range, grid) => editingHooks.editTable(range, grid),
    citations: () => editingHooks.citations(),
    openCitePicker: () => editingHooks.openCitePicker(),
    paperLabels: () => editingHooks.paperLabels(),
  })
  const spelling = spellcheck({
    // Documents only: not classes, packages or the vault's settings files.
    enabled: () => spellHooks.enabled() && !!current?.toLowerCase().endsWith('.tex'),
    check: (words) => spellHooks.check(words),
    suggest: (word) => spellHooks.suggest(word),
    add: (word) => spellHooks.add(word),
  })

  // Live mode: on by default; toggling it sets the default for files opened later.
  const LIVE_KEY = 'liveByDefault'
  const liveDefault = () => {
    try {
      return localStorage.getItem(LIVE_KEY) !== 'false'
    } catch {
      return true
    }
  }
  const live = liveMode(
    {
      render: () => render,
      images: () => imageHooks.images(),
      lists: () => editingHooks.lists(),
      citations: () => editingHooks.citations(),
      paper: (rel) => livePaper(rel),
    },
    liveDefault,
  )

  let outlineTimer: ReturnType<typeof setTimeout> | undefined
  function publishOutline(delay: number): void {
    clearTimeout(outlineTimer)
    outlineTimer = setTimeout(() => onoutline(outline(view.state.doc.toString())), delay)
  }

  function reportCursor(state: EditorState): void {
    const head = state.selection.main.head
    const line = state.doc.lineAt(head)
    oncursor(line.number, head - line.from + 1)
  }

  function makeState(text: string, rel: string): EditorState {
    // In live mode a file opens past its (folded) preamble. CodeMirror counts
    // a line break as one character, so the offset is taken with \n breaks.
    const body = liveDefault() ? /\\begin\s*\{document\}[^\n]*\n/.exec(text.replace(/\r\n/g, '\n')) : null
    return EditorState.create({
      doc: text,
      selection: body ? { anchor: body.index + body[0].length } : undefined,
      extensions: [
        // Keep the file's own line endings: CodeMirror otherwise joins lines
        // with \n, and saving would rewrite every line of a CRLF file.
        EditorState.lineSeparator.of(text.includes('\r\n') ? '\r\n' : '\n'),
        fileName.of(liveFile.of(rel)),
        basicSetup,
        endleafEditorTheme,
        latex,
        lintGutter(),
        preview,
        images,
        editing,
        spelling,
        live,
        EditorView.lineWrapping,
        Prec.highest(
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => (save(), true) },
            { key: 'Mod-Alt-j', preventDefault: true, run: () => (onsyncforward(), true) },
          ]),
        ),
        keymap.of([indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && current) ondirtychange(current, u.state.sliceDoc() !== saved.get(current))
          if (u.docChanged) publishOutline(300)
          if (u.docChanged && current) onedit(current)
          if (u.docChanged || u.selectionSet) reportCursor(u.state)
          if (isLive(u.state) !== isLive(u.startState)) {
            try {
              localStorage.setItem(LIVE_KEY, String(isLive(u.state)))
            } catch {
              // not remembered; fine
            }
            onlivechange(isLive(u.state))
          }
        }),
      ],
    })
  }

  /** The state of `rel`, loading it from disk if it isn't open yet (without showing it). */
  async function load(rel: string): Promise<EditorState> {
    if (rel === current) return view.state
    let state = states.get(rel)
    if (!state) {
      const text = await window.api.readFile(rel)
      saved.set(rel, text)
      state = makeState(text, rel)
      states.set(rel, state)
    }
    return state
  }

  /** Shows `rel` in the editor, loading it from disk the first time. */
  export async function open(rel: string): Promise<void> {
    if (rel === current) return
    const fresh = !states.has(rel)
    const state = await load(rel)
    if (current) {
      states.set(current, view.state)
      scrolls.set(current, view.scrollSnapshot())
    }
    current = rel
    view.setState(state)
    // A newly opened file starts at its cursor; one opened before, where it was left.
    const scroll = scrolls.get(rel)
    if (fresh || !scroll) view.dispatch({ effects: EditorView.scrollIntoView(state.selection.main.head, { y: 'start', yMargin: 60 }) })
    else view.dispatch({ effects: scroll })
    onlivechange(isLive(state))
    publishOutline(0)
    reportCursor(view.state)
    showDiagnostics()
    view.focus()
  }

  /** Uses the document's own macros (from its preamble and templates) in the math preview. */
  export function setMacros(macros: MacroDefs): void {
    const key = JSON.stringify(macros)
    if (key === macrosKey) return
    macrosKey = key
    render = createRenderer(macros)
    view.dispatch({ effects: refreshMath.of(null) })
  }

  /** Redraws what depends on the bibliography (citation chips) after it was reloaded. */
  export function refreshCitations(): void {
    view.dispatch({ effects: refreshMath.of(null) })
  }

  /** Redraws what depends on the paper (numbers carried across files, \input cards) after it changed. */
  export function refreshPaper(): void {
    view.dispatch({ effects: refreshMath.of(null) })
  }

  /** Replaces the problems shown in the editor (after each compile). */
  export function setProblems(problems: Problem[]): void {
    problemsByFile = new Map()
    for (const p of problems) {
      if (!p.file || p.line == null || p.hidden) continue
      problemsByFile.set(p.file, [...(problemsByFile.get(p.file) ?? []), p])
    }
    showDiagnostics()
  }

  function showDiagnostics(): void {
    if (!current) return
    const doc = view.state.doc
    const diagnostics: Diagnostic[] = (problemsByFile.get(current) ?? [])
      .filter((p) => p.line! >= 1 && p.line! <= doc.lines)
      .map((p) => {
        const line = doc.line(p.line!)
        return {
          from: line.from,
          to: line.to,
          severity: p.severity === 'error' ? 'error' : p.severity === 'warning' ? 'warning' : 'info',
          message: p.explanation ? `${p.title}. ${p.explanation}` : p.title,
        }
      })
    view.dispatch(setDiagnostics(view.state, diagnostics))
  }

  /**
   * Applies quick-fix edits to the open file as one undoable change.
   * Returns false (changing nothing) if any edit's text can't be found.
   */
  export function applyEdits(edits: TextEdit[]): boolean {
    const doc = view.state.doc
    const changes: { from: number; to: number; insert: string }[] = []
    for (const e of edits) {
      const insert = ('append' in e ? e.append : e.replace).replace(/\r?\n/g, view.state.lineBreak)
      if ('append' in e) {
        changes.push({ from: doc.length, to: doc.length, insert })
        continue
      }
      if (e.line < 1 || e.line > doc.lines) return false
      const line = doc.line(e.line)
      const at = locateOnLine(line.text, e.find, e.near)
      if (!at) return false
      changes.push({ from: line.from + at.from, to: line.from + at.to, insert })
    }
    view.dispatch({ changes, scrollIntoView: true })
    return true
  }

  /** Turns live mode on or off for the open file (Ctrl+Shift+L). */
  export function setLiveMode(on: boolean): void {
    view.dispatch({ effects: setLive.of(on) })
    view.focus()
  }

  /** Flips live mode for the open file. */
  export function toggleLiveMode(): void {
    toggleLive(view)
    view.focus()
  }

  /** Gives the editor keyboard focus (e.g. after a dialog closes). */
  /** Checks the spelling of the open file again (switched on or off, word list changed). */
  export function refreshSpellcheck(): void {
    view.dispatch({ effects: refreshSpelling.of(null) })
  }

  export function focus(): void {
    view.focus()
  }

  /** Inserts text at the cursor (replacing any selection). */
  export function insertAtCursor(text: string): void {
    const { from, to } = view.state.selection.main
    if (from !== to) view.dispatch({ changes: { from, to, insert: '' } })
    insertAt(view, from, text)
  }

  /** The open file's current text, saved or not. */
  export function currentText(): string {
    return view.state.sliceDoc()
  }

  /** The text of every open file with unsaved changes. */
  export function dirtyTexts(): Map<string, string> {
    const out = new Map<string, string>()
    const all = new Map(states)
    if (current) all.set(current, view.state)
    for (const [rel, state] of all) {
      const text = state.sliceDoc()
      if (text !== saved.get(rel)) out.set(rel, text)
    }
    return out
  }

  /** The current text of `rel` if it's open, saved or not; otherwise null. */
  export function textOf(rel: string): string | null {
    if (rel === current) return view.state.sliceDoc()
    return states.get(rel)?.sliceDoc() ?? null
  }

  /** Records that `text` is what's now on disk for `rel` (after the caller wrote it). */
  export function markSaved(rel: string, text: string): void {
    saved.set(rel, text)
    ondirtychange(rel, textOf(rel) !== text)
  }

  /**
   * Applies `changes` (offsets into the file's current text, inserts using
   * \n) to `rel` as one undoable change, opening it in the background if
   * needed. The file is left unsaved.
   */
  export async function applyChangesTo(rel: string, changes: { from: number; to: number; insert: string }[]): Promise<void> {
    if (!changes.length) return
    const state = await load(rel)
    const spec = { changes: changes.map((c) => ({ ...c, insert: c.insert.replace(/\r?\n/g, state.lineBreak) })), userEvent: 'input.replace' }
    if (rel === current) view.dispatch(spec)
    else {
      const next = state.update(spec).state
      states.set(rel, next)
      ondirtychange(rel, next.sliceDoc() !== saved.get(rel))
    }
  }

  /** Selects `from`–`to` in the open file and scrolls it into view. */
  export function select(from: number, to: number): void {
    const len = view.state.doc.length
    view.dispatch({
      selection: { anchor: Math.min(from, len), head: Math.min(to, len) },
      effects: EditorView.scrollIntoView(Math.min(from, len), { y: 'center' }),
    })
    view.focus()
  }

  /** The selected text in the open file ('' when nothing is selected). */
  export function selectedText(): string {
    const { from, to } = view.state.selection.main
    return view.state.sliceDoc(from, to)
  }

  /** Forgets `rel` (e.g. it was moved out of the vault), leaving the editor empty if it was open. */
  export function close(rel: string): void {
    states.delete(rel)
    scrolls.delete(rel)
    saved.delete(rel)
    if (current !== rel) return
    current = null
    view.setState(EditorState.create({ doc: '' }))
    onoutline([])
  }

  /** `from` was renamed to `to` on disk: its state (text, undo, scroll) follows. */
  export function rename(from: string, to: string): void {
    for (const m of [states, saved, scrolls] as Map<string, unknown>[]) {
      if (m.has(from)) {
        m.set(to, m.get(from))
        m.delete(from)
      }
    }
    const effects = fileName.reconfigure(liveFile.of(to))
    if (current === from) {
      current = to
      view.dispatch({ effects })
    } else if (states.has(to)) states.set(to, states.get(to)!.update({ effects }).state)
  }

  /** Saves the open file, as Ctrl+S does. */
  export function saveCurrent(): void {
    save()
  }

  /** Moves the cursor to the start of `line` (1-based) and centres it. */
  export function gotoLine(line: number): void {
    const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)))
    view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) })
    view.focus()
  }

  /** 1-based line number of the cursor. */
  export function cursorLine(): number {
    return view.state.doc.lineAt(view.state.selection.main.head).number
  }

  function save(): void {
    if (!current) return
    const text = view.state.sliceDoc() // sliceDoc, unlike doc.toString(), honours lineSeparator
    saved.set(current, text)
    ondirtychange(current, false)
    onsave(current, text)
  }

  /** The open file's text with \n line breaks (offsets match the editor's). */
  export function docText(): string {
    return view.state.doc.toString()
  }

  /** The math renderer, with the open document's macros. */
  export function mathRenderer(): RenderFn {
    return render
  }

  /** The cursor's offset in the open file. */
  export function cursorPos(): number {
    return view.state.selection.main.head
  }

  /** Replaces `from`–`to` (\n offsets) with `text`, as one undoable change, cursor after it. */
  export function replaceRange(from: number, to: number, text: string): void {
    const insert = text.replace(/\r?\n/g, view.state.lineBreak)
    // The editor counts a line break as one character, whatever the file uses.
    const end = from + text.replace(/\r\n/g, '\n').length
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: end }, scrollIntoView: true, userEvent: 'input' })
    view.focus()
  }

  /** Puts `text` at the cursor on lines of its own. */
  export function insertBlock(text: string): void {
    const pos = view.state.selection.main.head
    const line = view.state.doc.lineAt(pos)
    const head = line.text.slice(0, pos - line.from)
    const after = line.text.slice(pos - line.from).trim() ? '\n' : ''
    // Only indentation before the cursor: the block's own indentation replaces it.
    if (!head.trim()) replaceRange(line.from, pos, text + after)
    else replaceRange(pos, pos, '\n' + text + after)
  }

  onMount(() => {
    view = new EditorView({ parent: host, state: EditorState.create({ doc: '' }) })
    // A table's "Edit table" button in the live view.
    const onEditTable = (e: Event) => {
      const pos = (e as CustomEvent<number>).detail
      editingHooks.editTable(tableRangeAt(view.state.doc.toString(), Math.min(pos + 1, view.state.doc.length)), null)
    }
    view.dom.addEventListener(EDIT_TABLE_EVENT, onEditTable)
    // A citation chip's Ctrl+click.
    const onOpenLocation = (e: Event) => onopenlocation((e as CustomEvent<OpenLocation>).detail)
    view.dom.addEventListener(OPEN_LOCATION_EVENT, onOpenLocation)
    return () => (
      clearTimeout(outlineTimer),
      view.dom.removeEventListener(EDIT_TABLE_EVENT, onEditTable),
      view.dom.removeEventListener(OPEN_LOCATION_EVENT, onOpenLocation),
      view.destroy()
    )
  })
</script>

<div class="host" bind:this={host}></div>

<style>
  .host {
    height: 100%;
    overflow: hidden;
  }
  .host :global(.cm-editor) {
    height: 100%;
  }
  .host :global(.cm-cite-card) {
    max-width: 480px;
    padding: 4px 8px;
    font-family: var(--f-ui);
    font-size: 12px;
    line-height: 1.4;
  }
  .host :global(.cm-cite-card.missing) {
    color: var(--err);
  }
  .host :global(.cm-scroller) {
    font-family: var(--f-mono);
    font-size: 14px;
    line-height: 1.5;
  }
</style>
