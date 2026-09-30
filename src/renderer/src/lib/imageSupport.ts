// Images in the editor:
//  - typing ![[ (as in Obsidian) opens the image picker;
//  - inside \includegraphics{...}, autocomplete offers the vault's images;
//  - hovering an \includegraphics path shows the image;
//  - dropping image files, or pasting a screenshot, puts the image in the
//    vault and inserts an \includegraphics for it.
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, hoverTooltip } from '@codemirror/view'
import { fuzzyFilter, includegraphicsArgAt, isImage } from '@shared/images'
import { thumbnail } from './thumbnails'

export interface ImageHooks {
  /** The vault's images, vault-relative. */
  images(): string[]
  /** Open the picker; its choice is inserted at the cursor. */
  openPicker(): void
  /** Bring dropped files into the vault; resolves to vault-relative paths. */
  importFiles(files: File[]): Promise<string[]>
  /** Save a pasted image; resolves to its vault-relative path. */
  savePasted(blob: Blob): Promise<string>
}

export const includegraphics = (rel: string) => `\\includegraphics[width=0.5\\linewidth]{${rel}}`

export function imageSupport(hooks: ImageHooks): Extension {
  // Created once: CodeMirror matches a finished query to its source by
  // identity, so a fresh function per lookup leaves completion stuck pending.
  const source = (ctx: CompletionContext) => complete(ctx, hooks)
  const languageData = [{ autocomplete: source }]
  return [
    // ![[ → picker. The input handler sees the second [ before it's inserted.
    EditorView.inputHandler.of((view, from, to, text) => {
      if (text !== '[' || view.state.sliceDoc(Math.max(0, from - 2), from) !== '![') return false
      view.dispatch({ changes: { from: from - 2, to, insert: '' } })
      hooks.openPicker()
      return true
    }),

    EditorState.languageData.of(() => languageData),

    hoverTooltip((view, pos) => {
      const line = view.state.doc.lineAt(pos)
      const arg = includegraphicsArgAt(line.text, pos - line.from)
      const rel = arg && resolveImage(arg.text.trim(), hooks.images())
      if (!arg || !rel) return null
      return {
        pos: line.from + arg.from,
        end: line.from + arg.to,
        above: true,
        create: () => ({ dom: previewDom(rel) }),
      }
    }),

    EditorView.domEventHandlers({
      drop(event, view) {
        const files = [...(event.dataTransfer?.files ?? [])].filter((f) => isImage(f.name))
        if (!files.length) return false
        event.preventDefault()
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
        hooks.importFiles(files).then((rels) => insertAt(view, pos, rels.map(includegraphics).join('\n')))
        return true
      },
      paste(event, view) {
        const item = [...(event.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
        const blob = item?.getAsFile()
        if (!blob) return false
        event.preventDefault()
        const pos = view.state.selection.main.head
        hooks.savePasted(blob).then((rel) => insertAt(view, pos, includegraphics(rel)))
        return true
      },
    }),

    theme,
  ]
}

/** Inserts text at `pos` as its own change, leaving the cursor after it. */
export function insertAt(view: EditorView, pos: number, text: string): void {
  const insert = text.replace(/\n/g, view.state.lineBreak)
  // The editor counts a line break as one character, whatever the file uses.
  view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + text.length }, scrollIntoView: true })
  view.focus()
}

function complete(ctx: CompletionContext, hooks: ImageHooks): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const arg = includegraphicsArgAt(line.text, ctx.pos - line.from)
  if (!arg) return null
  // Filter by what's typed up to the cursor; replace the whole argument.
  const typed = line.text.slice(arg.from, ctx.pos - line.from)
  const matches = fuzzyFilter(typed, hooks.images().filter((p) => !/\.(svg|gif)$/i.test(p)))
  if (!matches.length) return null
  return {
    from: line.from + arg.from,
    to: line.from + arg.to,
    filter: false, // already ranked by fuzzyFilter
    options: matches.slice(0, 50).map((p) => ({
      label: p,
      type: 'file',
      info: () => previewDom(p),
    })),
  }
}

/**
 * The image an \includegraphics argument names. Like graphicx, an argument
 * without an extension tries .pdf, .png, .jpg, .jpeg in turn.
 */
export function resolveImage(arg: string, images: string[]): string | null {
  const norm = arg.replace(/^\.\//, '')
  const set = new Set(images)
  if (set.has(norm)) return norm
  for (const ext of ['.pdf', '.png', '.jpg', '.jpeg']) if (set.has(norm + ext)) return norm + ext
  return null
}

function previewDom(rel: string): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'cm-image-preview'
  const label = document.createElement('div')
  label.className = 'cm-image-label'
  label.textContent = rel
  dom.append(label)
  thumbnail(rel, 280).then((url) => {
    if (!url) {
      label.textContent = `${rel} (no preview for this format)`
      return
    }
    const img = document.createElement('img')
    img.src = url
    img.alt = rel
    dom.prepend(img)
  })
  return dom
}

const theme = EditorView.baseTheme({
  '.cm-image-preview': { padding: '6px', maxWidth: '300px', background: '#fff' },
  '.cm-image-preview img': { display: 'block', maxWidth: '280px', maxHeight: '220px', margin: '0 auto 4px' },
  '.cm-image-label': { fontSize: '11px', color: '#6a737d', fontFamily: "'Segoe UI', system-ui, sans-serif", wordBreak: 'break-all' },
})
