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

  let {
    onsave,
    ondirtychange,
    onsyncforward,
  }: {
    onsave: (rel: string, text: string) => void
    ondirtychange: (rel: string, dirty: boolean) => void
    /** Ctrl+J: show the cursor's line in the PDF. */
    onsyncforward: () => void
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
    showDiagnostics()
    view.focus()
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
    return () => view.destroy()
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
