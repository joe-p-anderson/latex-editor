import type { RenderFn } from '../../../renderer/src/lib/mathPreview'

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

/**
 * Draws a problem's math as SVG markup with `math` (the open document's
 * renderer, so its macros), remembering what it drew until they change. Bad math comes back as code.
 */
export function mathDrawer(math: () => RenderFn): (tex: string, display: boolean) => string {
  const drawn = new Map<string, string>()
  let drawnWith: RenderFn | null = null
  return (tex, display) => {
    const render = math()
    if (render !== drawnWith) {
      drawn.clear()
      drawnWith = render
    }
    const key = (display ? 'D' : 'I') + tex
    let svg = drawn.get(key)
    if (svg === undefined) {
      try {
        const r = render(tex, display)
        svg = r.error ? `<code class="bad">${escapeHtml(tex)}</code>` : r.svg
      } catch {
        svg = `<code class="bad">${escapeHtml(tex)}</code>`
      }
      drawn.set(key, svg)
    }
    return svg
  }
}
