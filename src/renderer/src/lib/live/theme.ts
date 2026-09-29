// Live mode's look. Everything is scoped under .cm-live, the class live mode
// puts on the editor, so plain source mode is untouched.
import { EditorView } from '@codemirror/view'

const ui = "'Segoe UI', system-ui, sans-serif"
const mono = "Consolas, 'Cascadia Mono', monospace"
const muted = 'var(--muted, #6a737d)'
const accent = 'var(--accent, #2f6fdb)'

export const liveTheme = EditorView.baseTheme({
  '&.cm-live .cm-content': {
    fontFamily: "Cambria, Georgia, 'Times New Roman', serif",
    fontSize: '16px',
    lineHeight: '1.6',
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
    fontSize: '10px',
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
  '.cm-live-marker.correct .cm-live-marker-label': { color: 'var(--ok, #1a7f37)' },
  '.cm-live-points': {
    fontFamily: ui,
    fontSize: '10px',
    color: muted,
    border: '1px solid var(--border, #d9dce1)',
    borderRadius: '8px',
    padding: '0 5px',
    marginLeft: '4px',
    verticalAlign: '2px',
  },

  // Rendered math.
  '.cm-live-math': { cursor: 'text' },
  '.cm-live-math svg': { verticalAlign: 'middle', maxWidth: '100%' },
  '.cm-live-math.block': { display: 'block', textAlign: 'center', padding: '4px 0', overflowX: 'auto' },
  '.cm-live-math.error': {
    fontFamily: mono,
    fontSize: '0.85em',
    textDecoration: 'wavy underline #cf222e',
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
    fontSize: '12px',
    color: muted,
    background: 'var(--panel, #f6f8fa)',
    border: '1px solid var(--border, #d9dce1)',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  '.cm-live-preamble-title': { fontWeight: '600', color: 'var(--fg, #1f2328)' },

  // A construct being edited: a light tint says "this is source".
  '&.cm-live .cm-live-src': { backgroundColor: 'rgba(47, 111, 219, 0.05)' },
  '&.cm-live .cm-live-code': { fontFamily: mono, fontSize: '13.5px', backgroundColor: 'rgba(0, 0, 0, 0.03)' },

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
    fontSize: '11px',
    lineHeight: '1.5',
    padding: '0 6px',
    borderRadius: '9px',
    verticalAlign: '1px',
    cursor: 'pointer',
  },
  '.cm-live-chip.label': { color: muted, background: 'rgba(110, 119, 129, 0.1)' },
  '.cm-live-chip.ref': { color: accent, background: 'var(--accent-soft, #e3ecfb)' },
  '.cm-live-chip.cite': { color: '#8250df', background: 'rgba(130, 80, 223, 0.1)' },
  '.cm-live-chip.missing': { color: '#cf222e', background: 'rgba(207, 34, 46, 0.1)' },

  '.cm-live-sym.faint': { color: muted, opacity: '0.55' },
  '.cm-live-sp': {
    backgroundImage: 'radial-gradient(circle, rgba(110, 119, 129, 0.3) 0.07em, transparent 0.09em)',
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
  '.cm-live-figure:hover, .cm-live-table:hover, .cm-live-preamble:hover': { borderColor: 'var(--border, #d9dce1)' },
  '.cm-live-figure-images': { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' },
  '.cm-live-img img': { display: 'block', maxWidth: '100%', maxHeight: '320px' },
  '.cm-live-img': { fontFamily: ui, fontSize: '12px', color: muted },
  '.cm-live-img.missing': { color: '#cf222e', padding: '12px', border: '1px dashed currentColor', borderRadius: '4px' },
  '.cm-live-image.block': { padding: '4px 0', textAlign: 'center', cursor: 'text' },
  '.cm-live-image': { display: 'inline-block', verticalAlign: 'middle', cursor: 'text' },
  '.cm-live-caption': { fontSize: '0.92em', margin: '6px 0 2px' },
  '.cm-live-table table': { borderCollapse: 'collapse', margin: '0 auto', fontSize: '0.95em' },
  '.cm-live-table td': { padding: '2px 10px' },
  '.cm-live-table td.align-l': { textAlign: 'left' },
  '.cm-live-table td.align-c': { textAlign: 'center' },
  '.cm-live-table td.align-r': { textAlign: 'right' },
  '.cm-live-table td.vl': { borderLeft: '1px solid #57606a' },
  '.cm-live-table td.vr': { borderRight: '1px solid #57606a' },
  '.cm-live-table tr.rule-above td': { borderTop: '1px solid #57606a' },
  '.cm-live-table tr.rule-below td': { borderBottom: '1px solid #57606a' },
  '.cm-live-table-src': { fontFamily: mono, fontSize: '12px', textAlign: 'left', margin: '0', whiteSpace: 'pre-wrap' },
})
