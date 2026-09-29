<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView, basicSetup } from 'codemirror'
  import { EditorState, Prec } from '@codemirror/state'
  import { keymap } from '@codemirror/view'
  import { indentWithTab } from '@codemirror/commands'
  import { StreamLanguage } from '@codemirror/language'
  import { stex } from '@codemirror/legacy-modes/mode/stex'

  let {
    onsave,
    ondirtychange,
  }: {
    onsave: (rel: string, text: string) => void
    ondirtychange: (rel: string, dirty: boolean) => void
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

  function makeState(text: string): EditorState {
    return EditorState.create({
      doc: text,
      extensions: [
        // Keep the file's own line endings: CodeMirror otherwise joins lines
        // with \n, and saving would rewrite every line of a CRLF file.
        EditorState.lineSeparator.of(text.includes('\r\n') ? '\r\n' : '\n'),
        basicSetup,
        latex,
        EditorView.lineWrapping,
        Prec.highest(keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => (save(), true) }])),
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
    view.focus()
  }

  /** Moves the cursor to the start of `line` (1-based) and centres it. */
  export function gotoLine(line: number): void {
    const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)))
    view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) })
    view.focus()
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
