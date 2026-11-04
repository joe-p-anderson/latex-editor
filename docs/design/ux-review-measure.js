// Measures every visible piece of text in the running endleaf window: its
// font size, face, and WCAG contrast ratio against the background actually
// behind it (opacity and stacked translucent backgrounds are blended in).
// Used for docs/design/UX-REVIEW.md.
//
// Run it in the app over CDP, e.g. with the plugin skill's driver:
//   PORT=<debug port> node .claude/skills/endleaf-plugin/drive.mjs evalfile docs/design/ux-review-measure.js > out.json
//
// Each entry: { region, role, text, size, family, cr, fg, bg, img }.
// region is where it sits (titlebar, activitybar, sidebar, tabs, editor,
// panel, pdf-toolbar, statusbar), found from the Plain look's layout. role
// splits the editor into body, command, comment, token and gutter. img is
// true when a background image (paper grain, marbling) sits under the text;
// the image itself is not measured, so contrast there is slightly optimistic.
// Icon-only buttons are listed too, with role "icon-<region>".
;(() => {
  function parse(c) {
    if (!c) return null
    let m = c.match(/rgba?\(([^)]+)\)/)
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
      return [p[0], p[1], p[2], p[3] ?? 1]
    }
    m = c.match(/color\(srgb ([^)]+)\)/)
    if (m) {
      const p = m[1].split(/[ /]+/).filter(Boolean).map(Number)
      return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]
    }
    return null
  }
  const over = (top, bot) => {
    const a = top[3]
    return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)).concat(1)
  }
  function background(el) {
    const stack = []
    let img = false
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      const b = parse(cs.backgroundColor)
      if (cs.backgroundImage !== 'none' && !b?.[3]) img = true
      if (b && b[3] > 0) {
        stack.push(b)
        if (b[3] >= 1) break
      }
    }
    let c = [255, 255, 255, 1]
    for (let i = stack.length - 1; i >= 0; i--) c = over(stack[i], c)
    return { c, img }
  }
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  const opacity = (el) => {
    let op = 1
    for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity
    return op
  }

  const W = innerWidth, H = innerHeight
  const pdf = [...document.querySelectorAll('canvas')].map((c) => c.getBoundingClientRect()).find((r) => r.width > 100)
  const pdfLeft = pdf ? pdf.left - 20 : W + 1
  function region(r) {
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    if (y < 36) return 'titlebar'
    if (y > H - 24) return 'statusbar'
    if (x < 44) return 'activitybar'
    if (x < 324) return 'sidebar'
    const panel = document.querySelector('[class*=ptab]')
    if (panel && y > panel.getBoundingClientRect().top - 12) return 'panel'
    if (x > pdfLeft) return 'pdf-toolbar'
    if (y < 72) return 'tabs'
    return 'editor'
  }
  function role(el, s, reg) {
    if (el.closest('.cm-gutters')) return 'gutter'
    if (el.closest('.cm-content')) {
      if (s.startsWith('%')) return 'comment'
      if (s.startsWith('\\')) return 'command'
      if (el.classList.contains('cm-line')) return 'body'
      return 'token'
    }
    return reg
  }

  const out = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const s = walker.currentNode.textContent.trim()
    if (!s) continue
    const el = walker.currentNode.parentElement
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue
    const fg = parse(cs.color)
    if (!fg) continue
    const { c: bg, img } = background(el)
    const shown = over([fg[0], fg[1], fg[2], fg[3] * opacity(el)], bg)
    const reg = region(r)
    out.push({
      region: reg, role: role(el, s, reg), text: s.slice(0, 28),
      size: parseFloat(cs.fontSize), family: cs.fontFamily.split(',')[0].replace(/"/g, ''),
      cr: +ratio(shown, bg).toFixed(2),
      fg: shown.slice(0, 3).map(Math.round).join(','), bg: bg.slice(0, 3).map(Math.round).join(','), img,
    })
  }
  for (const b of document.querySelectorAll('button')) {
    const r = b.getBoundingClientRect()
    const svg = b.querySelector('svg')
    if (r.width === 0 || r.top > H || !svg || b.innerText.trim()) continue
    const cs = getComputedStyle(svg)
    const col = parse(cs.stroke !== 'none' ? cs.stroke : cs.color) || parse(cs.color)
    if (!col) continue
    const { c: bg } = background(b)
    const shown = over([col[0], col[1], col[2], col[3] * opacity(svg)], bg)
    const reg = region(r)
    out.push({ region: reg, role: 'icon-' + reg, text: '[icon] ' + (b.title || b.getAttribute('aria-label') || '').slice(0, 26), size: r.width, cr: +ratio(shown, bg).toFixed(2), icon: true })
  }
  return out
})()
