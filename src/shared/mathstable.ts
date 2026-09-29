// What the live math preview shows while an equation is being typed. Half-typed
// math is usually an error for a moment (\hat{ before the x and the }), so
// instead of flashing red the preview keeps showing the last rendering that
// worked, faded, and only reports the error once typing has settled.
import type { Rendered } from './mathrender'

/** The last error-free rendering of the math starting at `from`. */
export interface LastGood {
  from: number
  svg: string
}

export interface Shown {
  /** The SVG to show, or null for none. */
  svg: string | null
  /** The SVG is the last good one, not the math as it stands. */
  stale: boolean
  error: string | null
  /** Show the "not closed yet" note. */
  unclosed: boolean
}

/**
 * `out` is the math rendered as it stands; `settled` is true once typing has
 * paused (or the cursor just moved here). Returns what to show and the new
 * last-good rendering.
 */
export function stablePreview(out: Rendered, closed: boolean, from: number, last: LastGood | null, settled: boolean): { shown: Shown; last: LastGood | null } {
  if (!out.error && closed) return { shown: { svg: out.svg, stale: false, error: null, unclosed: false }, last: { from, svg: out.svg } }
  const mine = last && last.from === from ? last : null
  if (!settled) {
    // Mid-typing: the last good rendering, or (for unclosed math that renders) the math so far.
    if (mine) return { shown: { svg: mine.svg, stale: true, error: null, unclosed: false }, last: mine }
    return { shown: { svg: out.error ? null : out.svg, stale: false, error: null, unclosed: false }, last: mine }
  }
  return {
    shown: { svg: out.error ? (mine?.svg ?? null) : out.svg, stale: !!out.error && !!mine, error: out.error, unclosed: !closed },
    last: mine,
  }
}
