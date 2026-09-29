// MathJax has no siunitx, and these documents use it constantly (\SI{9.8}{m/s^2}).
// This rewrites siunitx commands into plain TeX that MathJax can render:
//   \SI{7.9e-2}{kg.m/s^2}  →  7.9\times10^{-2}\,\mathrm{kg}\,\mathrm{m}/\mathrm{s}^{2}
// It covers numbers (with e-notation and ± uncertainty), literal units
// (kg.m/s^2, m^3 kg^{-1}) and the common unit macros (\meter\per\second).
// Unknown unit macros such as a document's own \DeclareSIUnit{\solarmass}
// are passed through for MathJax to expand as ordinary macros.

const UNIT_MACROS: Record<string, string> = {
  meter: 'm', metre: 'm', second: 's', kilogram: 'kg', gram: 'g', ampere: 'A', kelvin: 'K', mole: 'mol',
  candela: 'cd', newton: 'N', joule: 'J', watt: 'W', pascal: 'Pa', hertz: 'Hz', coulomb: 'C', volt: 'V',
  ohm: '\\Omega', farad: 'F', henry: 'H', tesla: 'T', weber: 'Wb', siemens: 'S', radian: 'rad',
  steradian: 'sr', becquerel: 'Bq', gray: 'Gy', sievert: 'Sv', lumen: 'lm', lux: 'lx',
  electronvolt: 'eV', liter: 'L', litre: 'L', minute: 'min', hour: 'h', day: 'd', bar: 'bar',
  degreeCelsius: '{}^{\\circ}\\mathrm{C}', degree: '{}^{\\circ}', arcminute: "'", arcsecond: "''",
  percent: '\\%', astronomicalunit: 'au', atomicmassunit: 'u', dalton: 'Da', angstrom: '\\unicode{x212B}',
}
const PREFIXES: Record<string, string> = {
  yocto: 'y', zepto: 'z', atto: 'a', femto: 'f', pico: 'p', nano: 'n', micro: '\\mu ', milli: 'm',
  centi: 'c', deci: 'd', deca: 'da', deka: 'da', hecto: 'h', kilo: 'k', mega: 'M', giga: 'G', tera: 'T',
  peta: 'P', exa: 'E', zetta: 'Z', yotta: 'Y',
}
// Units whose text is not wrapped in \mathrm (already math, e.g. degrees).
const RAW_UNIT = /^(\{\}\^|\\%|'|\\unicode)/

/** Rewrites every siunitx command in `tex`. Text without them is returned unchanged. */
export function expandSiunitx(tex: string): string {
  if (!/\\(SI|si|num|ang|qty|unit|qtyrange|SIrange|numrange|qtylist|SIlist)\b/.test(tex)) return tex
  let out = ''
  let i = 0
  while (i < tex.length) {
    const m = /^\\(SIrange|qtyrange|numrange|SI|si|num|ang|qty|unit)(?![A-Za-z])/.exec(tex.slice(i))
    if (!m || (i > 0 && tex[i - 1] === '\\')) {
      out += tex[i++]
      continue
    }
    let j = i + m[0].length
    // Optional [options]: accepted and ignored.
    const opt = readOptional(tex, j)
    if (opt) j = opt.end
    const args: string[] = []
    const need = { SI: 2, qty: 2, si: 1, unit: 1, num: 1, ang: 1, SIrange: 3, qtyrange: 3, numrange: 2 }[m[1]]!
    for (let k = 0; k < need; k++) {
      const a = readGroup(tex, j)
      if (!a) break
      args.push(a.body)
      j = a.end
    }
    if (args.length < need) {
      out += tex[i++] // malformed: leave it for MathJax to report
      continue
    }
    out += render(m[1], args)
    i = j
  }
  return out
}

function render(cmd: string, a: string[]): string {
  switch (cmd) {
    case 'SI':
    case 'qty':
      return `${formatNumber(a[0])}\\,${formatUnit(a[1])}`
    case 'si':
    case 'unit':
      return formatUnit(a[0])
    case 'num':
      return formatNumber(a[0])
    case 'ang':
      return formatAngle(a[0])
    case 'SIrange':
    case 'qtyrange':
      return `${formatNumber(a[0])}\\,${formatUnit(a[2])}\\text{ to }${formatNumber(a[1])}\\,${formatUnit(a[2])}`
    case 'numrange':
      return `${formatNumber(a[0])}\\text{ to }${formatNumber(a[1])}`
  }
  return ''
}

/** 7.9e-2 → 7.9\times10^{-2}; 1e21 → 10^{21}; 1.2+-0.1 → 1.2\pm0.1; -3.5 → -3.5 */
export function formatNumber(raw: string): string {
  let s = raw.trim().replace(/\s+/g, '')
  let unc = ''
  const pm = /^(.*?)(?:\+-|\\pm)(.*)$/.exec(s)
  if (pm) {
    s = pm[1]
    unc = pm[2]
  }
  const m = /^([+-]?)(\d*\.?\d*)(?:\(([\d.]+)\))?(?:[eEdD]([+-]?\d+))?$/.exec(s)
  if (!m || (!m[2] && !m[4])) return raw // not a plain number: pass through untouched
  const [, sign, mant, paren, exp] = m
  let body = mant
  if (paren) body += `(${paren})`
  if (unc) body = `${body}\\pm${formatNumber(unc)}`
  if (exp !== undefined) {
    const power = `10^{${exp.replace(/^\+/, '')}}`
    body = !mant || mant === '1' ? power : unc ? `(${body})\\times${power}` : `${body}\\times${power}`
  }
  return `${sign === '-' ? '-' : sign === '+' ? '+' : ''}${body}`
}

/** 90 → 90^{\circ};  12;30;0 → 12^{\circ}30'0'' */
function formatAngle(raw: string): string {
  const parts = raw.split(';')
  const marks = ['^{\\circ}', "'", "''"]
  return parts.map((p, k) => (p.trim() ? `${formatNumber(p)}${marks[k] ?? ''}` : '')).join('')
}

/**
 * Units, literal or macro. Literal: letters become upright (\mathrm), `.`,
 * `~` and spaces become thin spaces, `/`, `^` and braces are kept.
 * Macro: \kilo\meter\per\second\squared → \mathrm{km}\,\mathrm{s}^{-2}.
 */
export function formatUnit(raw: string): string {
  const s = raw.trim()
  return /\\(per|square|squared|cubic|cubed|tothe|raiseto|[a-z]+)(?![A-Za-z])/.test(s) && macroUnitsOnly(s) ? formatMacroUnit(s) : formatLiteralUnit(s)
}

function macroUnitsOnly(s: string): boolean {
  // "Macro form" means no bare letters outside macro names and their arguments.
  return !/(^|[^\\A-Za-z])[A-Za-z]/.test(s.replace(/\\[A-Za-z]+/g, '').replace(/\{[^}]*\}/g, ''))
}

function formatLiteralUnit(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i))!
      if (m[1] === ' ') out += '\\,'
      else {
        const name = m[1]
        const unit = unitMacro(name)
        out += unit ?? `\\${name}` // unknown: e.g. a \DeclareSIUnit'd \solarmass
      }
      i += m[0].length
      continue
    }
    if (/[A-Za-z]/.test(ch)) {
      const m = /^[A-Za-z]+/.exec(s.slice(i))!
      out += `\\mathrm{${m[0]}}`
      i += m[0].length
      continue
    }
    if (ch === '^' || ch === '_') {
      // Exponent: keep a braced group or a single (possibly signed) number.
      const g = /^\^(\{[^{}]*\}|-?\d+)/.exec(s.slice(i)) ?? /^_(\{[^{}]*\}|\w)/.exec(s.slice(i))
      if (g) {
        const arg = g[1].startsWith('{') ? g[1] : `{${g[1]}}`
        out += `${ch}${arg}`
        i += g[0].length
        continue
      }
    }
    if (ch === '.' || ch === '~' || ch === ' ') {
      if (!out.endsWith('\\,')) out += '\\,'
      i++
      continue
    }
    out += ch
    i++
  }
  return out
}

function unitMacro(name: string): string | null {
  if (Object.hasOwn(UNIT_MACROS, name)) {
    const u = UNIT_MACROS[name]
    return RAW_UNIT.test(u) ? u : `\\mathrm{${u}}`
  }
  return null
}

function formatMacroUnit(s: string): string {
  const parts: string[] = []
  let prefix = ''
  let per = false // \per applies to the next unit only
  let power = 1 // from a preceding \square or \cubic
  let last: { base: string; power: number; per: boolean } | null = null
  const emit = () => {
    if (!last) return
    const p = last.per ? -last.power : last.power
    parts.push(p === 1 ? last.base : `${last.base}^{${p}}`)
    last = null
  }
  for (const [, name, arg] of s.matchAll(/\\([A-Za-z]+)(?:\{([^}]*)\})?/g)) {
    if (name === 'per') { per = true; continue }
    if (name === 'square' || name === 'cubic') { power = name === 'square' ? 2 : 3; continue }
    if (name === 'squared' || name === 'cubed') { if (last) last.power *= name === 'squared' ? 2 : 3; continue }
    if ((name === 'tothe' || name === 'raiseto') && arg) { if (last) last.power *= Number(arg) || 1; continue }
    if (Object.hasOwn(PREFIXES, name)) { prefix += PREFIXES[name]; continue }
    emit()
    const u = Object.hasOwn(UNIT_MACROS, name) ? UNIT_MACROS[name] : null
    // Known units are upright text; unknown macros (a document's own
    // \DeclareSIUnit) and already-math units (degrees) are left as they are.
    const base = u != null && !RAW_UNIT.test(u) ? `\\mathrm{${prefix}${u}}` : `${prefix}${u ?? `\\${name}`}`
    last = { base, power, per }
    prefix = ''
    power = 1
    per = false
  }
  emit()
  return parts.join('\\,')
}

/** Reads a {group} starting at `i` (after optional spaces). */
function readGroup(s: string, i: number): { body: string; end: number } | null {
  while (s[i] === ' ') i++
  if (s[i] !== '{') return null
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue }
    if (s[j] === '{') depth++
    else if (s[j] === '}' && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 }
  }
  return null
}

function readOptional(s: string, i: number): { end: number } | null {
  if (s[i] !== '[') return null
  const close = s.indexOf(']', i)
  return close < 0 ? null : { end: close + 1 }
}
