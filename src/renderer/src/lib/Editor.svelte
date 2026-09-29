<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView, basicSetup } from 'codemirror'
  import { EditorState, Prec } from '@codemirror/state'
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
  import { outline, type OutlineItem } from '@shared/latexedit'

  let {
    onsave,
    ondirtychange,
    onsyncforward,
    imageHooks,
    editingHooks,
    onoutline,
    oncursorline,
  }: {
    onsave: (rel: string, text: string) => void
    ondirtychange: (rel: string, dirty: boolean) => void
    /** Ctrl+J: show the cursor's line in the PDF. */
    onsyncforward: () => void
    /** Image picker, autocomplete, hover previews, drop and paste. */
    imageHooks: ImageHooks
    /** List markers, the document's commands and the vault's snippets. */
    editingHooks: EditingHooks
    /** The open file's sections and questions, after each (debounced) change. */
    onoutline: (items: OutlineItem[]) => void
    /** 1-based line of the cursor, when it moves. */
    oncursorline: (line: number) => void
  } = $props()

  let host: HTMLDivElement
  let view: EditorView
  let current: string | null = null

  // One EditorState per opened file, so switching files keeps each file's
  // cursor, scroll and undo history. `saved` is the text as last written to
  // disk, for the unsaved-changes dot.
  const states = new Map<string, EditorState>()
  const saved = new Map<string, string>()

  const latex = StreamLanguage.define(stex)

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
  })

  let outlineTimer: ReturnType<typeof setTimeout> | undefined
  function publishOutline(delay: number): void {
    clearTimeout(outlineTimer)
    outlineTimer = setTimeout(() => onoutline(outline(view.state.doc.toString())), delay)
  }

  function makeState(text: string): EditorState {
    return EditorState.create({
      doc: text,
      extensions: [
        // Keep the file's own line endings: CodeMirror otherwise joins lines
        // with \n, and saving would rewrite every line of a CRLF file.
        EditorState.lineSeparator.of(text.includes('\r\n') ? '\r\n' : '\n'),
        basicSetup,
        latex,
        lintGutter(),
        preview,
        images,
        editing,
        EditorView.lineWrapping,
        Prec.highest(
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: () => (save(), true) },
            { key: 'Mod-j', preventDefault: true, run: () => (onsyncforward(), true) },
          ]),
        ),
        keymap.of([indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && current) ondirtychange(current, u.state.sliceDoc() !== saved.get(current))
          if (u.docChanged) publishOutline(300)
          if (u.docChanged || u.selectionSet) oncursorline(u.state.doc.lineAt(u.state.selection.main.head).number)
        }),
      ],
    })
  }

  /** Shows `rel` in the editor, loading it from disk the first time. */
  export async function open(rel: string): Promise<void> {
    if (rel === current) return
    if (current) states.set(current, view.state)
    let state = states.get(rel)
    if (!state) {
      const text = await window.api.readFile(rel)
      saved.set(rel, text)
      state = makeState(text)
    }
    current = rel
    view.setState(state)
    publishOutline(0)
    oncursorline(cursorLine())
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

  /** Gives the editor keyboard focus (e.g. after a dialog closes). */
  export function focus(): void {
    view.focus()
  }

  /** Inserts text at the cursor (replacing any selection). */
  export function insertAtCursor(text: string): void {
    const { from, to } = view.state.selection.main
    if (from !== to) view.dispatch({ changes: { from, to, insert: '' } })
    insertAt(view, from, text)
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

  onMount(() => {
    view = new EditorView({ parent: host, state: EditorState.create({ doc: '' }) })
    return () => (clearTimeout(outlineTimer), view.destroy())
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
  .host :global(.cm-scroller) {
    font-family: Consolas, 'Cascadia Mono', monospace;
    font-size: 14px;
    line-height: 1.5;
  }
</style>
