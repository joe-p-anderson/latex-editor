// Live mode's look. Everything is scoped under .cm-live, the class live mode
// puts on the editor, so plain source mode is untouched.
import { EditorView } from '@codemirror/view'

const ui = 'var(--f-ui)'
const mono = 'var(--f-mono)'
const muted = 'var(--ink-soft)'
const accent = 'var(--detail)'

export const liveTheme = EditorView.baseTheme({
  '&.cm-live .cm-content': {
    fontFamily: 'var(--f-page)',
    fontSize: 'var(--page-size)',
    lineHeight: '1.56',
    textAlign: 'justify',
    hyphens: 'auto',
    fontKerning: 'normal',
  },

  // Headings keep their size while being edited, so the line doesn't jump.
  '&.cm-live .cm-live-h1': { fontSize: '1.55em', fontWeight: '700', paddingTop: '0.5em' },
  '&.cm-live .cm-live-h2': { fontSize: '1.3em', fontWeight: '700', paddingTop: '0.35em' },
  '&.cm-live .cm-live-h3': { fontSize: '1.12em', fontWeight: '700', paddingTop: '0.2em' },
  '.cm-live-hnum': { color: muted, fontWeight: '600', marginRight: '0.5em' },

  // List environments: a faint label where \begin and \end are.
  '&.cm-live .cm-live-fence': { lineHeight: '1.1' },
  '.cm-live-fence-tag': {
    fontFamily: ui,
    fontSize: 'calc(var(--page-size) * 0.58)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: muted,
    opacity: '0.6',
    borderBottom: '1px dotted currentColor',
    padding: '0 4px',
    cursor: 'text',
  },
  '.cm-live-fence-tag.end': { borderBottom: 'none', borderTop: '1px dotted currentColor' },

  '.cm-live-marker': {
    display: 'inline-block',
    minWidth: '2em',
    textIndent: '0',
    paddingRight: '0.35em',
    boxSizing: 'border-box',
    textAlign: 'right',
    cursor: 'text',
  },
  '.cm-live-marker.number .cm-live-marker-label': { fontWeight: '700' },
  '.cm-live-marker.bullet .cm-live-marker-label': { color: muted },
  '.cm-live-marker.term': { minWidth: '0', textAlign: 'left' },
  '.cm-live-marker.term .cm-live-marker-label': { fontWeight: '700' },
  '.cm-live-marker.correct .cm-live-marker-label': { color: 'var(--ok)' },
  '.cm-live-points': {
    fontFamily: ui,
    fontSize: 'calc(var(--page-size) * 0.6)',
    color: muted,
    border: '1px solid var(--line)',
    borderRadius: '8px',
    padding: '0 5px',
    marginLeft: '4px',
    verticalAlign: '2px',
  },

  // Rendered math.
  '.cm-live-math': { cursor: 'text', color: 'var(--math)' },
  '.cm-live-math svg': { verticalAlign: 'middle', maxWidth: '100%' },
  '.cm-live-math.block': { display: 'block', textAlign: 'center', padding: '4px 0', overflowX: 'auto' },
  '.cm-live-math.error': {
    fontFamily: mono,
    fontSize: '0.85em',
    textDecoration: 'wavy underline var(--err)',
    textUnderlineOffset: '3px',
  },

  // The preamble, folded.
  '.cm-live-preamble': {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    margin: '4px 0 10px',
    padding: '4px 10px',
    fontFamily: ui,
    fontSize: 'calc(var(--page-size) * 0.7)',
    color: muted,
    background: 'var(--side)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  '.cm-live-preamble-title': { fontWeight: '600', color: 'var(--ink)' },
  // Around each card (see spaced() in widgets.ts): holds its margins in.
  '.cm-live-box': { display: 'flow-root' },

  // The title block, as \maketitle sets it.
  '.cm-live-front': { padding: '6px 0 14px', textAlign: 'center', textIndent: '0', hyphens: 'none', cursor: 'text' },
  '.cm-live-front-preprint': { fontFamily: ui, fontSize: 'calc(var(--page-size) * 0.66)', color: muted, textAlign: 'right' },
  '.cm-live-front-title': { fontSize: '1.3em', fontWeight: '700', lineHeight: '1.3', margin: '0.4em 1.5em 0.7em' },
  '.cm-live-front-authors': { marginTop: '0.35em' },
  '.cm-live-front-notes': { fontFamily: ui, fontSize: 'calc(var(--page-size) * 0.66)', color: muted, lineHeight: '1.45' },
  '.cm-live-front-aff': { fontStyle: 'italic', fontSize: '0.88em', color: muted },
  '.cm-live-front-date': { fontSize: '0.85em', color: muted, marginTop: '0.45em' },

  // An abstract's text, set in from both sides and a touch smaller.
  '&.cm-live .cm-live-inset': { paddingLeft: '2.2em', paddingRight: '2.2em', fontSize: '0.92em' },

  // An \input'ed file of a paper: its name and numbered headings.
  '.cm-live-include': {
    margin: '4px 0',
    padding: '5px 12px 6px',
    fontFamily: ui,
    fontSize: 'calc(var(--page-size) * 0.76)',
    lineHeight: '1.5',
    color: muted,
    background: 'var(--side)',
    border: '1px solid var(--line)',
    borderLeft: '3px solid var(--detail)',
    borderRadius: '4px',
    cursor: 'pointer',
    textIndent: '0',
  },
  '.cm-live-include:hover': { borderColor: 'var(--detail)' },

  // The paper's previous and next files, at a file's top and foot.
  '.cm-live-neighbour': {
    display: 'flex',
    gap: '10px',
    alignItems: 'baseline',
    fontFamily: ui,
    fontSize: 'calc(var(--page-size) * 0.7)',
    color: muted,
    cursor: 'pointer',
    textIndent: '0',
  },
  '.cm-live-neighbour.prev': { margin: '0 0 1.2em', paddingBottom: '0.5em', borderBottom: '1px dashed var(--line)' },
  '.cm-live-neighbour.next': { justifyContent: 'flex-end', margin: '1.6em 0 0', paddingTop: '0.6em', borderTop: '1px dashed var(--line)' },
  '.cm-live-neighbour-dir': { fontVariantCaps: 'all-small-caps', letterSpacing: '0.08em' },
  '.cm-live-neighbour-file': { color: 'var(--detail)', fontWeight: '600' },
  '.cm-live-neighbour:hover .cm-live-neighbour-file': { textDecoration: 'underline' },
  '.cm-live-include.off': { opacity: '0.55', borderLeftStyle: 'dashed' },
  '.cm-live-include.missing': { borderLeftColor: 'var(--err)' },
  '.cm-live-include-head': { display: 'flex', alignItems: 'baseline', gap: '8px' },
  '.cm-live-include-icon': { color: 'var(--detail)' },
  '.cm-live-include-file': { fontWeight: '600', color: 'var(--ink)', fontFamily: 'var(--f-mono)', fontSize: '0.95em' },
  '.cm-live-include-note': { fontStyle: 'italic' },
  '.cm-live-include.missing .cm-live-include-note': { color: 'var(--err)' },
  '.cm-live-include-h': { display: 'flex', gap: '8px', paddingLeft: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink)' },
  '.cm-live-include-h.l1': { paddingLeft: '36px', color: muted },
  '.cm-live-include-h.l2': { paddingLeft: '52px', color: muted },
  '.cm-live-include-h.more': { fontStyle: 'italic', color: muted },
  '.cm-live-include-num': { minWidth: '2.2em', fontVariantNumeric: 'tabular-nums', color: 'var(--detail)' },

  // The source block under the cursor: set in the mono at 0.74 × the text
  // size, with a rule on its left, running into the outer margin so typical
  // 74–80-character source lines don't wrap. Its line numbers show in the
  // inner margin (see editorTheme.ts).
  '&.cm-live .cm-live-src': {
    backgroundColor: 'var(--srcbg)',
    boxShadow: 'inset 2px 0 0 var(--detail)',
    fontFamily: mono,
    fontSize: 'calc(var(--page-size) * 0.74)',
    lineHeight: '1.62',
    textAlign: 'left',
    hyphens: 'none',
    marginLeft: '-0.7em',
    paddingLeft: 'calc(0.7em + 6px)',
    marginRight: 'calc(-1 * clamp(0.7em, var(--pad-r) - 36px, 110px))',
  },
  // Wide tables and display math may run into the outer margin, up to 70 px.
  '&.cm-live .cm-live-math.block, &.cm-live .cm-live-table': { marginRight: 'calc(-1 * min(70px, var(--pad-r)))' },
  '&.cm-live .cm-live-code': { fontFamily: mono, fontSize: '13.5px', backgroundColor: 'var(--srcbg)' },

  // \textbf and friends.
  '.cm-live-textbf': { fontWeight: '700' },
  '.cm-live-textit, .cm-live-emph, .cm-live-textsl': { fontStyle: 'italic' },
  '.cm-live-underline': { textDecoration: 'underline' },
  '.cm-live-texttt': { fontFamily: mono, fontSize: '0.9em' },
  '.cm-live-textsc': { fontVariant: 'small-caps' },
  '.cm-live-textsf': { fontFamily: ui },

  // Label and ref chips.
  // Widgets sit in list lines, which have a negative text-indent for the hanging marker.
  '.cm-live-chip, .cm-live-math, .cm-live-image, .cm-live-figure, .cm-live-table, .cm-live-fence-tag, .cm-live-preamble': { textIndent: '0' },
  '.cm-live-chip': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontFamily: ui,
    fontSize: 'calc(var(--page-size) * 0.74)',
    lineHeight: '1.5',
    padding: '0 6px',
    borderRadius: '9px',
    verticalAlign: '1px',
    cursor: 'pointer',
  },
  '.cm-live-chip.label': { color: muted, background: 'var(--sel)' },
  '.cm-live-chip.ref': { color: accent, background: 'var(--sel)' },
  '.cm-live-chip.cite': { color: 'var(--math)', background: 'color-mix(in srgb, var(--math) 14%, transparent)' },
  '.cm-live-chip.missing': { color: 'var(--err)', background: 'color-mix(in srgb, var(--err) 12%, transparent)' },

  '.cm-live-sym.faint': { color: muted, opacity: '0.55' },
  '.cm-live-sp': {
    backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--ink-soft) 45%, transparent) 0.07em, transparent 0.09em)',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
  },

  // Figures, tables and images.
  '.cm-live-figure, .cm-live-table': {
    margin: '6px auto',
    padding: '8px',
    textAlign: 'center',
    border: '1px solid transparent',
    borderRadius: '6px',
    cursor: 'text',
  },
  '.cm-live-figure:hover, .cm-live-table:hover, .cm-live-preamble:hover': { borderColor: 'var(--line)' },
  '.cm-live-figure-images': { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' },
  '.cm-live-img img': { display: 'block', maxWidth: '100%', maxHeight: '320px' },
  '.cm-live-img': { fontFamily: ui, fontSize: '12px', color: muted },
  '.cm-live-img.missing': { color: 'var(--err)', padding: '12px', border: '1px dashed currentColor', borderRadius: '4px' },
  '.cm-live-image.block': { padding: '4px 0', textAlign: 'center', cursor: 'text' },
  '.cm-live-image': { display: 'inline-block', verticalAlign: 'middle', cursor: 'text' },
  '.cm-live-caption': { fontSize: '0.92em', margin: '6px 0 2px' },
  '.cm-live-table table': { borderCollapse: 'collapse', margin: '0 auto', fontSize: '0.95em' },
  '.cm-live-table td': { padding: '2px 10px' },
  '.cm-live-table td.align-l': { textAlign: 'left' },
  '.cm-live-table td.align-c': { textAlign: 'center' },
  '.cm-live-table td.align-r': { textAlign: 'right' },
  '.cm-live-table td.vl': { borderLeft: '1px solid var(--ink-soft)' },
  '.cm-live-table td.vr': { borderRight: '1px solid var(--ink-soft)' },
  '.cm-live-table tr.rule-above td': { borderTop: '1px solid var(--ink-soft)' },
  '.cm-live-table tr.rule-below td': { borderBottom: '1px solid var(--ink-soft)' },
  '.cm-live-table': { position: 'relative' },
  '.cm-live-table-edit': {
    position: 'absolute',
    top: '4px',
    right: '4px',
    fontFamily: ui,
    fontSize: '11px',
    padding: '1px 8px',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    background: 'var(--paper)',
    color: muted,
    cursor: 'pointer',
    opacity: '0',
  },
  '.cm-live-table:hover .cm-live-table-edit': { opacity: '1' },
  '.cm-live-table-edit:hover': { color: 'var(--detail)', borderColor: 'var(--detail)' },
  '.cm-live-table-src': { fontFamily: mono, fontSize: '12px', textAlign: 'left', margin: '0', whiteSpace: 'pre-wrap' },
})
