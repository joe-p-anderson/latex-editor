// The editor's colours, from the appearance tokens (app.css), so source mode
// and CodeMirror's own panels and tooltips follow the page: paper or black.
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { ACTIVE_LINE_INK, editorColours as c } from '@shared/appearance'
import { roles } from './latexLanguage'

// The page column (docs/design/ENDLEAF.md, "The page column"). The scroller
// is the desk; the gutters are the page's inner margin (line numbers sit
// there) and the content is the rest of the page, its right padding the outer
// margin. The geometry (--leaf-w, --book-x, --pad-l, --pad-r) is worked out
// on the editor's container in App.svelte, where the index tabs share it.
const page = EditorView.theme({
  '&': { color: c.text, backgroundColor: 'var(--desk)' },
  '.cm-scroller': {
    paddingTop: '44px',
    paddingBottom: '90px',
    paddingLeft: 'var(--book-x)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--paper)',
    color: c.lineNumber,
    border: 'none',
    minWidth: 'var(--pad-l)', // the inner margin (Bench's boards sit outside, bench.css)
    boxSizing: 'border-box',
    justifyContent: 'flex-end',
    paddingRight: '6px',
  },
  '.cm-content': {
    caretColor: 'var(--ink)',
    flex: '0 0 auto',
    // CodeMirror pins the content's flex-basis to its width whenever it is
    // wider than the scroller (the page at its 260px floor in a narrow window),
    // so long lines don't jitter, and drops the pin only when a re-measure
    // sees the width change. The pin holds the width still, so the page stayed
    // narrow after the window widened again. The page has its own width and
    // lines always wrap, so the pin has no job here.
    flexBasis: 'auto !important',
    width: 'calc(var(--leaf-w) - var(--pad-l))',
    boxSizing: 'border-box',
    backgroundColor: 'var(--paper)',
    padding: '60px var(--pad-r) 110px 0',
  },
  '.cm-lineNumbers .cm-gutterElement': { font: '12px var(--f-page)', paddingRight: '6px' },
  // Source mode: the same page, in the mono at 0.74 × the text size.
  '&:not(.cm-live) .cm-content': { fontFamily: 'var(--f-mono)', fontSize: 'calc(var(--page-size) * 0.74)', lineHeight: '1.62' },
  // Live: only the source block under the cursor is numbered.
  '&.cm-live .cm-lineNumbers .cm-gutterElement': { visibility: 'hidden' },
  '&.cm-live .cm-lineNumbers .cm-gutterElement.cm-live-srcnum': { visibility: 'visible' },
  '&.cm-live .cm-activeLineGutter': { color: c.lineNumber },
})

const theme = EditorView.theme({
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ink)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--detail) 28%, transparent)',
  },
  // CodeMirror draws the selection beneath the text, but the page's paper is
  // painted on the text layer itself and would hide it: lift it above, see-through.
  '.cm-selectionLayer': { zIndex: '1 !important', pointerEvents: 'none' },
  '.cm-activeLine': { backgroundColor: `color-mix(in srgb, var(--ink) ${ACTIVE_LINE_INK * 100}%, transparent)` },
  '&.cm-live .cm-activeLine:not(.cm-live-src)': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: c.activeLineNumber },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--sel)', border: 'none', color: 'var(--ink-soft)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--detail) 22%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--detail) 50%, transparent)',
  },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': { color: 'var(--err)' },
  '.cm-searchMatch': { backgroundColor: 'var(--hl)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--detail) 50%, transparent)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--detail) 16%, transparent)' },
  '.cm-panels': { backgroundColor: 'var(--side)', color: 'var(--ink)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
  '.cm-panel input, .cm-panel button, .cm-textfield, .cm-button': {
    color: 'var(--ink)',
    backgroundColor: 'var(--paper)',
    backgroundImage: 'none',
    border: '1px solid var(--line)',
  },
  '.cm-tooltip': { backgroundColor: 'var(--paper)', color: 'var(--ink)', border: '1px solid var(--line)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--sel)', color: 'var(--ink)' },
  '.cm-completionDetail, .cm-completionInfo': { color: 'var(--ink-soft)' },
  '.cm-completionMatchedText': { color: 'var(--detail)', textDecoration: 'none', fontWeight: '600' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--err)' },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--warn)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'wavy underline var(--err)', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'wavy underline var(--warn)', textUnderlineOffset: '3px' },
})

// LaTeX source, in its three roles (latexLanguage.ts): commands in the
// accent, structure (environment names, keys) and maths in their own inks;
// braces dimmed, comments faint.
const highlight = HighlightStyle.define([
  { tag: roles.command, color: c.command },
  { tag: roles.structure, color: c.structure },
  { tag: roles.math, color: c.math },
  { tag: [t.comment, t.lineComment, t.blockComment], color: c.comment, fontStyle: 'italic' },
  { tag: [t.bracket, t.paren, t.squareBracket, t.brace, t.punctuation], color: c.bracket },
  { tag: t.invalid, color: 'var(--err)' },
  { tag: t.heading, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
])

export const endleafEditorTheme = [page, theme, syntaxHighlighting(highlight), EditorView.contentAttributes.of({ lang: 'en' })]
