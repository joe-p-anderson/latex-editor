// Applying quick-fix TextEdits. Shared so the tests check exactly the logic
// the editor uses.
import type { TextEdit } from './api'

/**
 * Where `edit.find` sits on `lineText`: the occurrence starting nearest the
 * edit's `near` column (TeX's error position), or the first one.
 */
export function locateOnLine(lineText: string, find: string, near?: number): { from: number; to: number } | null {
  if (find === '') return null
  const starts: number[] = []
  for (let i = lineText.indexOf(find); i >= 0; i = lineText.indexOf(find, i + 1)) starts.push(i)
  if (!starts.length) return null
  // TeX's column is where it stopped reading, i.e. at or after the end of the
  // offending text, so measure to each occurrence's end.
  const pick = near == null ? starts[0] : starts.reduce((a, b) => (Math.abs(b + find.length - near) < Math.abs(a + find.length - near) ? b : a))
  return { from: pick, to: pick + find.length }
}

/** Applies edits to a whole file's text, keeping its line endings. */
export function applyEdits(text: string, edits: TextEdit[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  for (const e of edits) {
    if ('append' in e) {
      text += e.append.replace(/\r?\n/g, eol)
      continue
    }
    const lines = text.split(eol)
    const i = e.line - 1
    const at = i >= 0 && i < lines.length ? locateOnLine(lines[i], e.find, e.near) : null
    if (!at) throw new Error(`Can't find "${e.find}" on line ${e.line}`)
    lines[i] = lines[i].slice(0, at.from) + e.replace.replace(/\r?\n/g, eol) + lines[i].slice(at.to)
    text = lines.join(eol)
  }
  return text
}
