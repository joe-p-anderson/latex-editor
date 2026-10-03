// LaTeX editing helpers for CodeMirror:
//  - Ctrl+B / Ctrl+I / Ctrl+E toggle \textbf, \textit, \emph (\mathbf and
//    \mathit inside math); Ctrl+M toggles $...$, Ctrl+Shift+M makes \[...\];
//  - Ctrl+Shift+A / E put the selection in align / equation (Ctrl+Alt+A / E
//    for align* / equation*); Ctrl+Shift+F / Ctrl+Alt+F insert a figure /
//    figure* with its \includegraphics ready for an image path;
//  - Enter in a list starts the next item (\item, or the vault's own markers
//    such as \question); Enter on an empty last item leaves the list;
//    Shift+Enter is a plain new line;
//  - Enter after an unclosed \begin{...} adds its \end; renaming either end
//    of an environment renames the other;
//  - typing $ pairs it;
//  - completion for commands (with argument placeholders), environments,
//    \ref labels, \cite keys (searched by author, title and year), and the
//    vault's snippet file;
//  - typing \cite{ opens the cite picker; hovering a cite key shows its entry;
//  - folding of environments, sections and questions;
//  - F2 on a \label or \ref key renames it across the vault;
//  - Ctrl+Alt+T, or pasting spreadsheet cells, opens the table editor.
// The text logic lives in @shared/latexedit; this file wires it to the editor.
import { snippet, startCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { insertNewlineAndIndent } from '@codemirror/commands'
import { foldService, indentUnit } from '@codemirror/language'
import { EditorSelection, EditorState, Prec, StateField, type Extension } from '@codemirror/state'
import { EditorView, hoverTooltip, keymap } from '@codemirror/view'
import { citeKeyAt, entryText, OPEN_CITE, searchBib } from '@shared/bibtex'
import type { Citations } from './citations'
import {
  beginEnter,
  blankComments,
  envStackAt,
  envTokens,
  isUnclosed,
  labels,
  listEnter,
  matchEnd,
  mirrorEnvRename,
  toggleCommand,
  toggleInlineMath,
  wrapBlock,
  type CommandSig,
  type Edit,
  type EnvToken,
  type Snippet,
} from '@shared/latexedit'
import { findMathRegions } from '@shared/mathregions'
import { headingAt } from '@shared/paperedit'
import { keyAt } from '@shared/search'
import { clipboardGrid, tableRangeAt } from '@shared/tablemodel'
import { latexPairs } from './pairs'
import { mathShortcuts } from './mathShortcuts'
import type { MathSnippet } from '@shared/mathsnippets'

export interface EditingHooks {
  /** List environment → item command, without the backslash. */
  lists(): Record<string, string>
  /** Commands and environments the open document's classes and preamble define. */
  commands(): CommandSig[]
  environments(): string[]
  /** The vault's snippets. */
  snippets(): Snippet[]
  /** Math shortcuts: the built-ins with the vault's own file applied. */
  mathSnippets(): MathSnippet[]
  /** F2 on a \label or \ref key: rename it everywhere. */
  renameLabel(key: string): void
  /**
   * Open the table editor: on the table at `range` (null for a new one at
   * the cursor), with `grid` pasted in at the cursor's row when given.
   */
  editTable(range: { from: number; to: number } | null, grid: string[][] | null): void
  /** The open document's bibliography, once loaded. */
  citations(): Citations | null
  /** Open the cite picker (typing \cite{, Ctrl+Shift+C). */
  openCitePicker(): void
  /** Labels in the paper's other files, with what a \ref to them prints. */
  paperLabels(): PaperLabel[]
}

/** A label elsewhere in a multi-part paper. */
export interface PaperLabel {
  key: string
  number: string
  kind: string
  /** The file it's in, vault-relative. */
  file: string
}

/** What the editor's right-click menu can ask the app for. */
export interface ContextHooks {
  /** Show the cursor's line in the PDF. */
  showInPdf(): void
  /** Move a section (its heading's line) or exactly a range into a file of its own; `title` names the file. */
  extract(what: { line: number } | { from: number; to: number }, title: string): void
}

const slug = (s: string) => s.replace(/%.*$/gm, '').replace(/\\[a-zA-Z]+\*?|[{}$\\]/g, ' ').trim().split(/\s+/).slice(0, 4).join(' ')

/** The right-click menu: the clipboard, formatting, the PDF, and moving text to a file of its own. */
function contextMenu(hooks: ContextHooks): Extension {
  return EditorView.domEventHandlers({
    contextmenu(e, view) {
      const { from, to } = view.state.selection.main
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
      if (pos !== null && (pos < from || pos > to)) view.dispatch({ selection: { anchor: pos } })
      e.preventDefault()
      const sel = view.state.selection.main
      const text = view.state.doc.toString()
      const heading = sel.empty ? headingAt(text, view.state.doc.lineAt(sel.head).number) : null
      const canExtract = sel.empty ? !!heading : !!text.slice(sel.from, sel.to).trim()
      void window.api
        .contextMenu([
          { id: 'cut', label: 'Cut', enabled: !sel.empty },
          { id: 'copy', label: 'Copy', enabled: !sel.empty },
          { id: 'paste', label: 'Paste' },
          { id: 'all', label: 'Select All' },
          { id: '', label: '', separator: true },
          { id: 'bold', label: 'Bold' },
          { id: 'italic', label: 'Italic' },
          { id: '', label: '', separator: true },
          { id: 'pdf', label: 'Show in PDF' },
          { id: '', label: '', separator: true },
          { id: 'extract', label: 'Move to a file of its own…', enabled: canExtract },
        ])
        .then(async (id) => {
          if (!id) return
          view.focus()
          const s = view.state.selection.main
          switch (id) {
            case 'cut':
            case 'copy':
              await navigator.clipboard.writeText(view.state.sliceDoc(s.from, s.to))
              if (id === 'cut') view.dispatch({ changes: { from: s.from, to: s.to }, userEvent: 'delete.cut' })
              break
            case 'paste': {
              const t = await navigator.clipboard.readText()
              if (t) view.dispatch({ ...view.state.replaceSelection(t.replace(/\r\n?/g, view.state.lineBreak)), scrollIntoView: true, userEvent: 'input.paste' })
              break
            }
            case 'all':
              view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
              break
            case 'bold':
              format(view, 'textbf', 'boldsymbol', ['mathbf', 'bm'])
              break
            case 'italic':
              format(view, 'textit', 'mathrm', ['mathit', 'textrm'])
              break
            case 'pdf':
              hooks.showInPdf()
              break
            case 'extract': {
              const now = view.state.selection.main
              if (now.empty) {
                const h = headingAt(view.state.doc.toString(), view.state.doc.lineAt(now.head).number)
                if (h) hooks.extract({ line: h.line }, h.title)
              } else hooks.extract({ from: now.from, to: now.to }, slug(view.state.sliceDoc(now.from, now.to)))
              break
            }
          }
        })
        .catch(() => {})
      return true
    },
  })
}

export function latexEditing(hooks: EditingHooks & ContextHooks): Extension {
  const source = (ctx: CompletionContext) => complete(ctx, hooks)
  const languageData = [{ autocomplete: source, closeBrackets: { brackets: ['(', '[', '{'] } }]
  return [
    // Below the spelling menu on a misspelled word, which handles its right-click first.
    Prec.low(contextMenu(hooks)),
    indentUnit.of('    '),
    EditorState.languageData.of(() => languageData),
    Prec.highest(
      keymap.of([
        // In math, bold is \boldsymbol (bold Greek too) and "italic" is upright \mathrm,
        // math being italic already. Each also removes the older forms instead of nesting.
        { key: 'Mod-b', preventDefault: true, run: (v) => format(v, 'textbf', 'boldsymbol', ['mathbf', 'bm']) },
        { key: 'Mod-i', preventDefault: true, run: (v) => format(v, 'textit', 'mathrm', ['mathit', 'textrm']) },
        { key: 'Mod-e', preventDefault: true, run: (v) => format(v, 'emph', 'mathit') },
        { key: 'Mod-m', preventDefault: true, run: inlineMath },
        { key: 'Mod-Shift-m', preventDefault: true, run: (v) => block(v, '\\[', '\\]') },
        { key: 'Mod-Shift-a', preventDefault: true, run: (v) => environment(v, 'align') },
        { key: 'Mod-Alt-a', preventDefault: true, run: (v) => environment(v, 'align*') },
        { key: 'Mod-Shift-e', preventDefault: true, run: (v) => environment(v, 'equation') },
        { key: 'Mod-Alt-e', preventDefault: true, run: (v) => environment(v, 'equation*') },
        { key: 'Mod-Shift-f', preventDefault: true, run: (v) => figure(v, 'figure') },
        { key: 'Mod-Alt-f', preventDefault: true, run: (v) => figure(v, 'figure*') },
        { key: 'F2', run: (v) => renameKey(v, hooks) },
        { key: 'Mod-Alt-t', preventDefault: true, run: (v) => (hooks.editTable(tableRangeAt(v.state.doc.toString(), v.state.selection.main.head), null), true) },
      ]),
    ),
    tablePaste(hooks),
    mathShortcuts(() => hooks.mathSnippets()),
    latexPairs(),
    // Below the completion popup's own Enter (which is highest).
    Prec.high(
      keymap.of([
        { key: 'Enter', run: (v) => enter(v, hooks) },
        { key: 'Shift-Enter', run: insertNewlineAndIndent },
      ]),
    ),
    EditorView.inputHandler.of(dollar),
    EditorView.inputHandler.of((view, from, to, text) => citeOpened(view, from, text, hooks)),
    citeHover(hooks),
    mirrorRenames,
    structure,
    folding,
  ]
}

/**
 * Pasting spreadsheet cells (Excel, Sheets, a web page's table) opens the
 * table editor with them, instead of dumping tab-separated text. Inside a
 * table they go in at the cursor's row; elsewhere they make a new table.
 * Ctrl+Shift+V pastes the plain text as usual.
 */
function tablePaste(hooks: EditingHooks): Extension {
  let plain = false
  return EditorView.domEventHandlers({
    keydown(e) {
      plain = e.shiftKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v'
      return false
    },
    paste(event, view) {
      const asPlain = plain
      plain = false
      const data = event.clipboardData
      if (asPlain || !data || [...data.items].some((i) => i.type.startsWith('image/'))) return false
      const grid = clipboardGrid(data.getData('text/plain'), data.getData('text/html'))
      if (!grid) return false
      event.preventDefault()
      hooks.editTable(tableRangeAt(view.state.doc.toString(), view.state.selection.main.head), grid)
      return true
    },
  })
}

/**
 * Typing the { of an empty \cite{ (or \citep[…]{, \parencite{, …) opens the
 * cite picker once the brace is in. Returns false: the brace goes in as usual.
 */
function citeOpened(view: EditorView, from: number, text: string, hooks: EditingHooks): boolean {
  if (text !== '{' || !hooks.citations()?.info.entries.length) return false
  const line = view.state.doc.lineAt(from)
  const before = line.text.slice(0, from - line.from) + '{'
  const after = line.text.slice(from - line.from)
  // Only a fresh one: nothing typed in it yet (the brace may be auto-closed after).
  if (OPEN_CITE.exec(before)?.[1] !== '' || /^[^}\s]/.test(after)) return false
  setTimeout(() => hooks.openCitePicker(), 0)
  return false
}

/** Hovering a key in \cite{…} shows its entry. */
function citeHover(hooks: EditingHooks): Extension {
  return hoverTooltip((view, pos) => {
    const cites = hooks.citations()
    if (!cites) return null
    const line = view.state.doc.lineAt(pos)
    const hit = citeKeyAt(line.text, pos - line.from)
    if (!hit) return null
    const entry = cites.byKey.get(hit.key)
    const label = cites.info.labels[hit.key]
    return {
      pos: line.from + hit.from,
      end: line.from + hit.to,
      above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'cm-cite-card'
        dom.textContent = entry ? `${label ? `[${label}] ` : ''}${entryText(entry)}` : `No entry "${hit.key}" in ${cites.info.bibs.join(', ') || 'the bibliography'}`
        if (!entry) dom.classList.add('missing')
        return { dom }
      },
    }
  })
}

/** F2: rename the label key under the cursor, if there is one. */
function renameKey(view: EditorView, hooks: EditingHooks): boolean {
  const key = keyAt(view.state.doc.toString(), view.state.selection.main.head)
  if (!key) return false
  hooks.renameLabel(key)
  return true
}

/** Applies an Edit from @shared/latexedit, whose inserts use \n. */
function apply(view: EditorView, edit: Edit, userEvent: string): void {
  const lb = view.state.lineBreak
  view.dispatch({
    changes: edit.changes.map((c) => ({ ...c, insert: c.insert.replace(/\n/g, lb) })),
    selection: EditorSelection.single(edit.anchor, edit.head ?? edit.anchor),
    scrollIntoView: true,
    userEvent,
  })
}

const mathRegionAt = (text: string, pos: number) => findMathRegions(text).find((r) => r.from < pos && pos < r.to) ?? null

function format(view: EditorView, textCmd: string, mathCmd: string, mathAlternates: string[] = []): boolean {
  const { from, to } = view.state.selection.main
  const text = view.state.doc.toString()
  const math = !!mathRegionAt(text, from)
  apply(view, toggleCommand(text, from, to, math ? mathCmd : textCmd, math ? mathAlternates : []), 'input.format')
  return true
}

function inlineMath(view: EditorView): boolean {
  const { from, to } = view.state.selection.main
  const text = view.state.doc.toString()
  apply(view, toggleInlineMath(text, from, to, mathRegionAt(text, from)), 'input.format')
  return true
}

function block(view: EditorView, open: string, close: string): boolean {
  const { from, to } = view.state.selection.main
  apply(view, wrapBlock(view.state.doc.toString(), from, to, open, close, view.state.facet(indentUnit)), 'input.format')
  return true
}

const environment = (view: EditorView, name: string) => block(view, `\\begin{${name}}`, `\\end{${name}}`)

/**
 * A figure at the cursor, on lines of its own. Tab goes path → width →
 * caption → label; the image list opens for the path straight away.
 */
function figure(view: EditorView, name: string): boolean {
  const pos = view.state.selection.main.to
  const line = view.state.doc.lineAt(pos)
  const pre = line.text.slice(0, pos - line.from).trim() ? '\n' : ''
  const post = line.text.slice(pos - line.from).trim() ? '\n' : ''
  const template = [
    `${pre}\\begin{${name}}[htbp]`,
    '\t\\centering',
    '\t\\includegraphics[width=${2:0.5}\\linewidth]{${1}}',
    '\t\\caption{${3}}',
    '\t\\label{fig:${4}}',
    `\\end{${name}}${post}`,
  ].join('\n')
  snippet(template)(view, null, pos, pos)
  startCompletion(view)
  return true
}

function enter(view: EditorView, hooks: EditingHooks): boolean {
  const sel = view.state.selection
  if (sel.ranges.length > 1 || !sel.main.empty) return false
  const text = view.state.doc.toString()
  const pos = sel.main.head
  const unit = view.state.facet(indentUnit)
  const lists = hooks.lists()
  const edit = beginEnter(text, pos, lists, unit) ?? listEnter(text, pos, lists, unit)
  if (!edit) return false
  apply(view, edit, 'input')
  return true
}

/**
 * $ pairs: $| becomes $|$, typing $ before a closing $ steps over it, and
 * $|$ becomes $$|$$. A selection is wrapped. \$ is left alone.
 */
function dollar(view: EditorView, from: number, to: number, text: string): boolean {
  if (text !== '$' || view.state.selection.ranges.length > 1) return false
  const doc = view.state.doc
  const before = doc.sliceString(Math.max(0, from - 2), from)
  const after = doc.sliceString(to, to + 1)
  if (before.endsWith('\\')) return false
  if (from !== to) {
    view.dispatch({
      changes: [{ from, insert: '$' }, { from: to, insert: '$' }],
      selection: EditorSelection.single(from + 1, to + 1),
      userEvent: 'input.type',
    })
    return true
  }
  // $|$ → $$|$$ (display math).
  if (after === '$' && before.endsWith('$') && !before.endsWith('$$')) {
    view.dispatch({ changes: { from, insert: '$$' }, selection: { anchor: from + 1 }, userEvent: 'input.type' })
    return true
  }
  // Inside math (opened earlier on the line) this $ closes it: step over a
  // closing $ that's already there, otherwise type it.
  const line = doc.lineAt(from)
  const inMath = findMathRegions(doc.sliceString(line.from, from)).some((r) => !r.closed)
  if (inMath) {
    if (after !== '$') return false
    view.dispatch({ selection: { anchor: from + 1 } })
    return true
  }
  view.dispatch({ changes: { from, insert: '$$' }, selection: { anchor: from + 1 }, userEvent: 'input.type' })
  return true
}

/** Keeps \begin{name} and \end{name} matched while either name is edited. */
const mirrorRenames = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent('input') || tr.isUserEvent('delete'))) return tr
  const edits: { from: number; to: number; insert: string }[] = []
  tr.changes.iterChanges((from, to, _fb, _tb, inserted) => edits.push({ from, to, insert: inserted.toString() }))
  if (edits.length !== 1) return tr
  const e = edits[0]
  const line = tr.startState.doc.lineAt(e.from)
  if (!/\\(?:begin|end)\s*\{/.test(line.text)) return tr
  const partner = mirrorEnvRename(tr.startState.doc.toString(), e.from, e.to, e.insert)
  if (!partner) return tr
  return [tr, { changes: { from: tr.changes.mapPos(partner.from), to: tr.changes.mapPos(partner.to), insert: partner.insert }, sequential: true }]
})

// ---------------------------------------------------------------------------
// Folding

interface Heading {
  pos: number
  /** 0 chapter … 3 subsubsection, 4 question. */
  level: number
}

interface Structure {
  tokens: EnvToken[]
  headings: Heading[]
}

const HEADING_LEVEL: Record<string, number> = { chapter: 0, section: 1, subsection: 2, subsubsection: 3, question: 4 }

function scanStructure(text: string): Structure {
  const headings: Heading[] = []
  for (const m of blankComments(text).matchAll(/\\(chapter|section|subsection|subsubsection|question)\*?(?![A-Za-z@])/g)) {
    headings.push({ pos: m.index!, level: HEADING_LEVEL[m[1]] })
  }
  return { tokens: envTokens(text), headings }
}

const structure = StateField.define<Structure>({
  create: (state) => scanStructure(state.doc.toString()),
  update: (value, tr) => (tr.docChanged ? scanStructure(tr.newDoc.toString()) : value),
})

const folding = foldService.of((state, lineFrom, lineTo) => {
  const { tokens, headings } = state.field(structure)
  const doc = state.doc
  const lastLineEnd = (pos: number) => doc.lineAt(pos).from - 1 // end of the line before `pos`

  // An environment that starts on this line and ends on a later one.
  for (const t of tokens) {
    if (t.from > lineTo) break
    if (t.from < lineFrom || t.kind !== 'begin') continue
    const end = matchEnd(tokens, t)
    if (end && doc.lineAt(end.from).number > doc.lineAt(t.from).number + 1) return { from: lineTo, to: lastLineEnd(end.from) }
  }

  // A heading: up to the next one at the same or a higher level, or the end
  // of the environment (e.g. questions, document) it sits in.
  const i = headings.findIndex((h) => h.pos >= lineFrom && h.pos <= lineTo)
  if (i < 0) return null
  const h = headings[i]
  let stop = doc.length + 1
  const next = headings.slice(i + 1).find((n) => n.level <= h.level)
  if (next) stop = doc.lineAt(next.pos).from
  const env = envStackAt(tokens, h.pos).at(-1)
  const envEnd = env && matchEnd(tokens, env)
  if (envEnd && envEnd.from < stop) stop = doc.lineAt(envEnd.from).from
  // Don't hide trailing blank lines: they separate this from what follows.
  let to = stop - 1
  while (to > lineTo && !doc.lineAt(to).text.trim()) to = doc.lineAt(to).from - 1
  return to > lineTo ? { from: lineTo, to } : null
})

// ---------------------------------------------------------------------------
// Completion

// Common commands and their required argument counts. The document's own
// (from its class and preamble) are added at completion time.
const BUILTIN_COMMANDS: [string, number][] = `
textbf:1 textit:1 emph:1 texttt:1 textsc:1 underline:1 textsuperscript:1 textsubscript:1 text:1 textcolor:2
mathbf:1 mathrm:1 mathit:1 mathcal:1 boldsymbol:1 operatorname:1
frac:2 dfrac:2 tfrac:2 sqrt:1 vec:1 hat:1 bar:1 dot:1 ddot:1 tilde:1 overline:1 overrightarrow:1
section:1 subsection:1 subsubsection:1 paragraph:1 label:1 ref:1 eqref:1 pageref:1
caption:1 footnote:1 href:2 url:1 input:1 include:1 usepackage:1
SI:2 si:1 qty:2 unit:1 num:1 ang:1
vspace:1 hspace:1 mbox:1 fbox:1 begin:1 end:1
item left right cdot times approx pm mp neq leq geq ll gg propto sim equiv infty partial nabla
int iint oint sum prod lim sin cos tan arcsin arccos arctan sinh cosh ln log exp to rightarrow Rightarrow leftrightarrow
alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau
upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega hbar ell degree circ
quad qquad hfill vfill newpage clearpage noindent centering maketitle tableofcontents hline ldots cdots dots
`
  .trim()
  .split(/\s+/)
  .map((s) => {
    const [name, n] = s.split(':')
    return [name, Number(n ?? 0)]
  })

// Commands whose usual form isn't just {…} per argument.
const COMMAND_TEMPLATES: Record<string, string> = {
  includegraphics: '\\includegraphics[width=${1:0.5}\\linewidth]{${2}}',
  begin: '\\begin{${}}',
}

const BUILTIN_ENVIRONMENTS = `itemize enumerate description figure table tabular center flushleft flushright minipage
align align* equation equation* gather* cases pmatrix bmatrix vmatrix array verbatim quote wrapfigure multicols tikzpicture`.split(/\s+/)

// What goes after \begin{name} (arguments) and inside it, for environments that need more than an empty line.
const ENV_TEMPLATES: Record<string, { args?: string; body?: string[] }> = {
  figure: { args: '[${1:htbp}]', body: ['\\centering', '\\includegraphics[width=${2:0.5}\\linewidth]{${3}}', '\\caption{${4}}', '\\label{fig:${5}}'] },
  table: { args: '[${1:htbp}]', body: ['\\centering', '\\caption{${2}}', '\\begin{tabular}{${3:cc}}', '\t${4}', '\\end{tabular}'] },
  tabular: { args: '{${1:cc}}' },
  minipage: { args: '[t]{${1:0.5}\\linewidth}' },
  wrapfigure: { args: '{${1:r}}{${2:0.4}\\linewidth}' },
  multicols: { args: '{${1:2}}' },
  array: { args: '{${1:cc}}' },
}

const KIND_NAMES: Record<string, string> = { section: 'Sec. ', equation: 'Eq. ', figure: 'Fig. ', table: 'Table ', question: 'Question ', item: 'Item ' }

function complete(ctx: CompletionContext, hooks: EditingHooks): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const before = line.text.slice(0, ctx.pos - line.from)

  const env = /\\(begin|end)\s*\{([^}\s\\]*)$/.exec(before)
  if (env) return completeEnvironment(ctx, hooks, env[1] as 'begin' | 'end', ctx.pos - env[2].length)

  const cite = OPEN_CITE.exec(before)
  if (cite) return completeCite(ctx, cite[1], hooks)

  const ref = /\\(?:ref|eqref|cref|Cref|autoref|pageref|nameref|vref)\s*\{([^}]*)$/.exec(before)
  if (ref) {
    return {
      from: ctx.pos - ref[1].length,
      options: [
        ...labels(ctx.state.doc.toString()).map((l) => ({ label: l, type: 'constant' })),
        // The paper's other files: "Eq. (12) · 3_reduced".
        ...hooks.paperLabels().map((l) => ({
          label: l.key,
          type: 'constant',
          detail: `  ${KIND_NAMES[l.kind] ?? ''}${l.kind === 'equation' ? `(${l.number})` : l.number} · ${l.file.split('/').pop()!.replace(/\.tex$/, '')}`,
          boost: -1,
        })),
      ],
      validFor: /^[^}\s]*$/,
    }
  }

  const cmd = /(?<!\\)\\([A-Za-z@]*)$/.exec(before)
  if (!cmd || (!cmd[1] && !ctx.explicit)) return null
  return { from: ctx.pos - cmd[0].length, options: commandOptions(hooks), validFor: /^\\[A-Za-z@]*$/ }
}

/**
 * Keys for the cite command the cursor is in: the word after the last comma
 * is matched against each entry's key, authors, title, year and journal, not
 * just the key, and the best matches come first.
 */
function completeCite(ctx: CompletionContext, typed: string, hooks: EditingHooks): CompletionResult | null {
  const cites = hooks.citations()
  if (!cites?.info.entries.length) return null
  const word = typed.slice(typed.lastIndexOf(',') + 1).trimStart()
  if (!word && !ctx.explicit) return null
  const matches = searchBib(cites.info.entries, word).slice(0, 60)
  return {
    from: ctx.pos - word.length,
    filter: false,
    options: matches.map((e, i) => ({
      label: e.key,
      detail: `  ${[e.author, e.year].filter(Boolean).join(' ')}${cites.info.labels[e.key] ? ` [${cites.info.labels[e.key]}]` : ''}`,
      info: [e.title, e.venue].filter(Boolean).join('. '),
      type: 'text',
      boost: -i,
    })),
  }
}

function commandOptions(hooks: EditingHooks): Completion[] {
  const byName = new Map<string, Completion>()
  const add = (name: string, args: number, detail: string, boost: number, optional = false) => {
    const template = COMMAND_TEMPLATES[name] ?? `\\${name}` + Array.from({ length: args }, (_, i) => `{\${${i + 1}}}`).join('')
    byName.set(name, {
      label: `\\${name}`,
      detail: (optional ? '[…]' : '') + '{…}'.repeat(args) + (detail ? `  ${detail}` : ''),
      type: 'function',
      boost,
      apply: args || COMMAND_TEMPLATES[name] ? snippet(template) : `\\${name}`,
    })
  }
  for (const [name, args] of BUILTIN_COMMANDS) add(name, args, '', 0)
  add('includegraphics', 1, '', 0, true)
  for (const marker of new Set(Object.values(hooks.lists()))) add(marker, 0, 'list item', 1)
  for (const c of hooks.commands()) add(c.name, c.args, 'document', 1, c.optional)
  for (const s of hooks.snippets()) {
    byName.set(s.name, { label: `\\${s.name}`, detail: s.description ? `  ${s.description}` : '  snippet', type: 'text', boost: 2, apply: snippet(s.body) })
  }
  return [...byName.values()]
}

function completeEnvironment(ctx: CompletionContext, hooks: EditingHooks, kind: 'begin' | 'end', from: number): CompletionResult {
  const lists = hooks.lists()
  const text = ctx.state.doc.toString()
  let names: string[]
  if (kind === 'end') {
    // Open environments first, innermost first.
    const open = envStackAt(envTokens(text), from).map((t) => t.name).reverse()
    names = [...new Set([...open, ...Object.keys(lists), ...hooks.environments(), ...BUILTIN_ENVIRONMENTS])]
  } else {
    names = [...new Set([...Object.keys(lists), ...hooks.environments(), ...BUILTIN_ENVIRONMENTS])]
  }
  return {
    from,
    validFor: /^[\w*@:]*$/,
    options: names.map((name, i) => ({
      label: name,
      type: 'type',
      detail: name in lists ? `\\${lists[name]}` : undefined,
      boost: kind === 'end' ? -i / names.length : 0,
      apply: (view: EditorView, completion: Completion, start: number, end: number) => {
        // Replace the rest of the name and the closing brace, if there is one.
        const rest = /^[^}\s\\]*(\})?/.exec(view.state.doc.sliceString(end, end + 100))!
        const nameEnd = end + rest[0].length - (rest[1] ? 1 : 0)
        const doc = view.state.doc.toString()
        const after = doc.slice(0, start) + name + '}' + doc.slice(nameEnd + (rest[1] ? 1 : 0))
        if (kind === 'begin' && isUnclosed(after, name)) {
          const t = ENV_TEMPLATES[name]
          const body = t?.body ?? [lists[name] ? `\\${lists[name]} \${}` : '${}']
          const template = `${name}}${t?.args ?? ''}\n${body.map((l) => `\t${l}`).join('\n')}\n\\end{${name}}`
          snippet(template)(view, completion, start, nameEnd + (rest[1] ? 1 : 0))
        } else if (rest[1]) {
          // Just the name: an existing \end{...} is renamed to match (see mirrorRenames).
          view.dispatch({ changes: { from: start, to: nameEnd, insert: name }, selection: { anchor: start + name.length + 1 }, userEvent: 'input.complete' })
        } else {
          view.dispatch({ changes: { from: start, to: nameEnd, insert: `${name}}` }, selection: { anchor: start + name.length + 1 }, userEvent: 'input.complete' })
        }
      },
    })),
  }
}
