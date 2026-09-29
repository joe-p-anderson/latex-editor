// Turns parsed log entries into Problems: a plain-English title, an
// explanation, the right location (which is often not where TeX noticed),
// and quick fixes. Everything here is deterministic; each rule matches a
// specific TeX/LaTeX message.
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { Problem, QuickFix, Severity, TextEdit } from '../shared/api'
import type { LogEntry } from './logparser'
import { closest, distance, type Definitions } from './macros'
import { scanBraces, scanEnvironments, scanMath, scanParagraphBraces } from './scan'

export interface DiagnoseContext {
  /** Absolute vault root; the compile's working directory. */
  root: string
  /** The compiled document, vault-relative. */
  doc: string
  /** Source text of a vault-relative or absolute path, or null if unreadable. */
  read(file: string): Promise<string | null>
  /** Every file in the vault, vault-relative. */
  files(): Promise<string[]>
  /** Labels defined in the compiled document (from its .aux). */
  labels(): Promise<string[]>
  /** Commands and environments that exist for this document. */
  definitions(): Promise<Definitions>
}

// Commands and environments that come from a package, for "add \usepackage".
const COMMAND_PACKAGE: Record<string, string> = {
  includegraphics: 'graphicx', graphicspath: 'graphicx', rotatebox: 'graphicx', scalebox: 'graphicx',
  text: 'amsmath', eqref: 'amsmath', dfrac: 'amsmath', tfrac: 'amsmath', binom: 'amsmath', intertext: 'amsmath',
  mathbb: 'amssymb', mathfrak: 'amssymb', therefore: 'amssymb', because: 'amssymb',
  SI: 'siunitx', si: 'siunitx', qty: 'siunitx', unit: 'siunitx', num: 'siunitx', ang: 'siunitx',
  href: 'hyperref', url: 'hyperref', hyperref: 'hyperref', autoref: 'hyperref',
  textcolor: 'xcolor', color: 'xcolor', colorbox: 'xcolor', definecolor: 'xcolor',
  toprule: 'booktabs', midrule: 'booktabs', bottomrule: 'booktabs', cmidrule: 'booktabs',
  cancel: 'cancel', bcancel: 'cancel', cancelto: 'cancel',
  dv: 'physics', pdv: 'physics', abs: 'physics', norm: 'physics', bra: 'physics', ket: 'physics', braket: 'physics', grad: 'physics', curl: 'physics',
  vv: 'esvect', ce: 'mhchem', cref: 'cleveref', Cref: 'cleveref', lipsum: 'lipsum',
  draw: 'tikz', node: 'tikz', fill: 'tikz', usetikzlibrary: 'tikz', multirow: 'multirow',
  hl: 'soul', ul: 'soul', sout: 'ulem', uline: 'ulem', lstinline: 'listings',
}
const ENVIRONMENT_PACKAGE: Record<string, string> = {
  align: 'amsmath', 'align*': 'amsmath', gather: 'amsmath', 'gather*': 'amsmath', multline: 'amsmath', split: 'amsmath',
  cases: 'amsmath', pmatrix: 'amsmath', bmatrix: 'amsmath', vmatrix: 'amsmath', matrix: 'amsmath', aligned: 'amsmath',
  tikzpicture: 'tikz', circuitikz: 'circuitikz', axis: 'pgfplots', subfigure: 'subcaption', wrapfigure: 'wrapfig',
  multicols: 'multicol', 'multicols*': 'multicol', tabularx: 'tabularx', longtable: 'longtable', lstlisting: 'listings',
  minted: 'minted', framed: 'framed', mdframed: 'mdframed', tcolorbox: 'tcolorbox', landscape: 'pdflscape',
}
// Commands that only work in math mode, for explaining "Missing $ inserted".
const MATH_ONLY = /^(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|frac|dfrac|sqrt|sum|prod|int|oint|lim|infty|partial|nabla|times|cdot|div|pm|mp|leq|geq|le|ge|neq|approx|equiv|sim|propto|rightarrow|leftarrow|Rightarrow|to|vec|hat|bar|dot|ddot|tilde|overline|underline|mathrm|mathbf|mathit|mathcal|left|right|sin|cos|tan|log|ln|exp)$/

const IMAGE_EXT = /\.(png|jpe?g|pdf|eps|svg)$/i

interface State {
  /** Spans of environments reported undefined: errors inside are follow-ons. */
  badEnvs: { file: string; name: string; from: number; to: number }[]
  /** Rules already reported, in order. */
  seen: Problem[]
}

export async function diagnose(entries: LogEntry[], ctx: DiagnoseContext): Promise<Problem[]> {
  const state: State = { badEnvs: [], seen: [] }
  const problems: Problem[] = []
  for (const e of entries) {
    const p = await diagnoseOne(e, ctx, state)
    if (!p) continue
    problems.push(p)
    state.seen.push(p)
  }
  markFollowOns(problems, state)
  // Errors first (real ones before follow-ons), then warnings, then layout.
  const rank = (p: Problem) => ({ error: 0, warning: 2, layout: 3 })[p.severity] + (p.followOn ? 1 : 0)
  return problems.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p)
}

async function diagnoseOne(e: LogEntry, ctx: DiagnoseContext, state: State): Promise<Problem | null> {
  const file = locate(e.file, ctx)
  const base = (severity: Severity, rule: string, title: string, extra: Partial<Problem> = {}): Problem => ({
    rule, severity, file, line: e.line, title, fixes: [], tex: e.raw.join('\n'), ...extra,
  })

  if (e.level === 'badbox') return badbox(e, base)
  if (e.level === 'warning') return warning(e, ctx, base)

  const msg = e.message.replace(/^(LaTeX|Package \S+|Class \S+) Error: /, '')
  let m: RegExpExecArray | null

  // --- undefined command ----------------------------------------------------
  if (/^Undefined control sequence/.test(msg)) {
    const cmd = /\\([A-Za-z@]+|.)\s*$/.exec(e.context?.before ?? '')?.[1]
    if (!cmd) return base('error', 'undefined-command', 'A command here is not defined')
    const defs = await ctx.definitions()
    const suggestions = closest(cmd, defs.commands)
    const pkg = lookup(COMMAND_PACKAGE, cmd)
    const fixes: QuickFix[] = suggestions.map((s) => ({
      label: `Change to \\${s}`,
      edits: [edit(file, e.line, `\\${cmd}`, `\\${s}`, e.context)],
    }))
    let explanation: string
    if (pkg) {
      explanation = `\\${cmd} comes from the ${pkg} package, which this document doesn't load.`
      const add = await usePackageFix(ctx, pkg)
      if (add) fixes.unshift(add)
    } else if (suggestions.length) {
      explanation = `Nothing called \\${cmd} is defined. Did you mean ${suggestions.map((s) => `\\${s}`).join(', ')}?`
    } else {
      explanation = `\\${cmd} isn't defined by LaTeX, this document, or any class or package it loads (${defs.commands.size.toLocaleString()} commands checked), and nothing defined has a similar name. If it used to come from a template such as a .cls file, it may have been removed or renamed there.`
    }
    return base('error', 'undefined-command', `\\${cmd} is not defined`, { explanation, fixes })
  }

  // --- environments ---------------------------------------------------------
  if ((m = /^Environment (\S+) undefined/.exec(msg))) {
    const name = m[1]
    const defs = await ctx.definitions()
    const suggestions = closest(name, defs.environments)
    const pkg = lookup(ENVIRONMENT_PACKAGE, name)
    const endLine = await findLine(ctx, file, `\\end{${name}}`, e.line ?? 1)
    if (file && e.line) state.badEnvs.push({ file, name, from: e.line, to: endLine ?? e.line })
    const fixes: QuickFix[] = suggestions.map((s) => ({
      label: `Change to ${s}`,
      edits: [
        edit(file, e.line, `\\begin{${name}}`, `\\begin{${s}}`),
        ...(endLine ? [edit(file, endLine, `\\end{${name}}`, `\\end{${s}}`)] : []),
      ],
    }))
    if (pkg) {
      const add = await usePackageFix(ctx, pkg)
      if (add) fixes.unshift(add)
    }
    const explanation = pkg
      ? `The ${name} environment comes from the ${pkg} package, which this document doesn't load.`
      : suggestions.length
        ? `There's no environment called "${name}". Did you mean ${suggestions.join(', ')}?`
        : `There's no environment called "${name}", and none with a similar name.`
    return base('error', 'undefined-environment', `Unknown environment "${name}"`, { explanation, fixes })
  }

  if ((m = /\\begin\{(.+?)\} on input line (\d+) ended by \\end\{(.+?)\}/.exec(msg))) {
    const [, opened, openLine, closed] = m
    const title = opened === 'document'
      ? `\\end{${closed}} has no matching \\begin{${closed}}`
      : `\\end{${closed}} closes \\begin{${opened}} from line ${openLine}`
    const fixes: QuickFix[] = opened === 'document' ? [] : [
      { label: `Change to \\end{${opened}}`, edits: [edit(file, e.line, `\\end{${closed}}`, `\\end{${opened}}`)] },
      { label: `Change line ${openLine} to \\begin{${closed}}`, edits: [edit(file, Number(openLine), `\\begin{${opened}}`, `\\begin{${closed}}`)] },
    ]
    return base('error', 'env-mismatch', title, {
      explanation: opened === 'document'
        ? `Every \\end needs a \\begin with the same name. This one closes nothing, so LaTeX thinks it is ending the document.`
        : `Environments must close in the order they were opened. The innermost open environment here is ${opened}.`,
      fixes,
      related: opened === 'document' || !file ? undefined : [{ file, line: Number(openLine), label: `\\begin{${opened}}` }],
    })
  }

  // --- files ------------------------------------------------------------------
  // LaTeX's wording, and plain TeX's for \input of a name it can't open.
  if ((m = /File `(.+?)' not found|^I can't find file `(.+?)'/.exec(msg))) return missingFile(m[1] ?? m[2], e, file, ctx, base)

  // --- math mode ------------------------------------------------------------
  if (/^Missing \$ inserted/.test(msg)) {
    const src = file ? await ctx.read(file) : null
    const open = src && e.line ? scanMath(src).find((p) => p.line <= e.line! && e.line! - p.line <= 30) : undefined
    if (open) {
      return base('error', 'unclosed-math', `Math started on line ${open.line} is never closed`, {
        line: open.line,
        explanation: `A $ on line ${open.line} starts math, but the paragraph ends before a closing $. Everything after it is being read as math.`,
        related: file && e.line !== open.line ? [{ file, line: e.line!, label: 'where LaTeX noticed' }] : undefined,
      })
    }
    const before = e.context?.before ?? ''
    const after = e.context?.after ?? ''
    const cmd = /\\([A-Za-z]+)\s*$/.exec(before)?.[1]
    const script = /([A-Za-z0-9]+)([_^])$/.exec(before)
    if (script) {
      const arg = /^(\{[^{}]*\}|[A-Za-z0-9])/.exec(after)?.[1] ?? ''
      const token = `${script[1]}${script[2]}${arg}`
      return base('error', 'missing-dollar', `"${script[2]}" only works in math mode`, {
        explanation: `${script[2] === '_' ? 'Subscripts' : 'Superscripts'} like ${token} need to be inside math: $${token}$.`,
        fixes: [{ label: `Change to $${token}$`, edits: [edit(file, e.line, token, `$${token}$`, e.context)] }],
      })
    }
    if (cmd && MATH_ONLY.test(cmd)) {
      return base('error', 'missing-dollar', `\\${cmd} only works in math mode`, {
        explanation: `\\${cmd} is a math command. Put it between dollar signs, e.g. $\\${cmd}$.`,
      })
    }
    return base('error', 'missing-dollar', 'Math-only text outside math mode', {
      explanation: 'Something on this line (a _, ^, or math command) only works between $ signs, or a blank line interrupted an equation.',
    })
  }

  if ((m = /^Double (subscript|superscript)/.exec(msg))) {
    const s = m[1] === 'subscript' ? '_' : '^'
    const before = e.context?.before ?? ''
    const after = e.context?.after ?? ''
    const esc = s === '^' ? '\\^' : '_'
    const b = new RegExp(`([A-Za-z0-9\\\\]+)${esc}(\\{[^{}]*\\}|[A-Za-z0-9])${esc}$`).exec(before)
    const a = /^(\{[^{}]*\}|[A-Za-z0-9])/.exec(after)
    const fixes: QuickFix[] = []
    if (b && a) {
      const find = `${b[1]}${s}${b[2]}${s}${a[1]}`
      const inner = b[2].replace(/^\{|\}$/g, '')
      fixes.push({ label: `Change to ${b[1]}${s}{${inner}${s}${a[1]}}`, edits: [edit(file, e.line, find, `${b[1]}${s}{${inner}${s}${a[1]}}`, e.context)] })
    }
    return base('error', 'double-script', `Two ${m[1]}s in a row`, {
      explanation: `x${s}a${s}b is ambiguous. Group the ${m[1]}s with braces: x${s}{a${s}b}.`,
      fixes,
    })
  }

  // --- braces ---------------------------------------------------------------
  if ((m = /^(?:File ended while scanning use of|Paragraph ended before) (\\\S+?)(?: was complete)?\s*\.?$/.exec(msg)) || /^Runaway argument/.test(msg)) {
    const target = file ?? ctx.doc
    const src = await ctx.read(target)
    let at = src ? scanParagraphBraces(src)[0] ?? scanBraces(src).unclosed[0] : undefined
    // The runaway text TeX printed starts at the unclosed brace; find it.
    if (src && e.runaway) {
      const probe = e.runaway.replace(/^\{/, '').split(/\\par|\s{2,}/)[0].trim().slice(0, 30)
      const idx = probe ? src.indexOf(probe) : -1
      if (idx >= 0) {
        const line = src.slice(0, idx).split('\n').length
        at = { line, col: 0 }
      }
    }
    const cmd = m?.[1]
    const lineText = src && at ? src.split(/\r?\n/)[at.line - 1] : null
    return base('error', 'unclosed-brace', at ? `A { on line ${at.line} is never closed` : 'A { is never closed', {
      file: target,
      line: at?.line ?? null,
      explanation: `${cmd ? `The argument of ${cmd}` : 'A braced group'} runs on without its closing }, so LaTeX read to the ${/File ended/.test(msg) ? 'end of the file' : 'end of the paragraph'} looking for it.`,
      fixes: lineText != null && at
        ? [{ label: `Add } at the end of line ${at.line}`, edits: [{ file: target, line: at.line, find: lineText, replace: `${lineText.replace(/\s+$/, '')}}` }] }]
        : [],
    })
  }

  if (/^Too many \}'s|^Extra \}, or forgotten/.test(msg)) {
    const before = e.context?.before ?? ''
    const tail = /[^\s]{0,20}\}$/.exec(before)?.[0]
    return base('error', 'extra-brace', 'A } here has no matching {', {
      explanation: 'There is one more closing brace than opening braces at this point.',
      fixes: tail ? [{ label: 'Remove this }', edits: [edit(file, e.line, tail, tail.slice(0, -1), e.context)] }] : [],
    })
  }

  // --- other common errors ----------------------------------------------------
  if (/^Misplaced alignment tab character &/.test(msg)) {
    const tail = /[^\s]{0,15}\s*&$/.exec(e.context?.before ?? '')?.[0]
    return base('error', 'misplaced-ampersand', '& is only allowed in tables and aligned equations', {
      explanation: 'On its own, & separates columns. To print an ampersand, write \\&.',
      fixes: tail ? [{ label: 'Change to \\&', edits: [edit(file, e.line, tail, `${tail.slice(0, -1)}\\&`, e.context)] }] : [],
    })
  }

  if (/^There's no line here to end/.test(msg)) {
    return base('error', 'no-line-to-end', '\\\\ with no line to end', {
      explanation: '\\\\ ends a line, but here it comes at the start of a paragraph (or right after a blank line). For vertical space use \\vspace{...}; otherwise remove it.',
      fixes: [{ label: 'Remove the \\\\', edits: [edit(file, e.line, '\\\\', '', e.context)] }],
    })
  }

  if (/^Illegal unit of measure|^Missing number, treated as zero/.test(msg)) {
    const num = /\{(-?[\d.]+)\}\s*$/.exec(e.context?.before ?? '')
    return base('error', 'bad-length', num ? `The length "${num[1]}" needs a unit` : 'A length is missing or has no unit', {
      explanation: 'Lengths need a unit, such as 2in, 1.5cm, 12pt or 0.5\\baselineskip.',
      fixes: num
        ? ['in', 'cm'].map((u) => ({ label: `Use ${num[1]}${u}`, edits: [edit(file, e.line, `{${num[1]}}`, `{${num[1]}${u}}`, e.context)] }))
        : [],
    })
  }

  if (/^\*\*\* \(job aborted, no legal \\end found\)/.test(msg)) {
    const src = await ctx.read(ctx.doc)
    if (src && !/^[^%\n]*\\end\{document\}/m.test(src)) {
      return base('error', 'missing-end-document', 'The document never reaches \\end{document}', {
        file: ctx.doc,
        line: src.split(/\r?\n/).length,
        explanation: 'LaTeX reached the end of the file without finding \\end{document}.',
        fixes: [{ label: 'Add \\end{document}', edits: [{ file: ctx.doc, append: `${/\n$/.test(src) ? '' : '\n'}\\end{document}\n` }] }],
      })
    }
    return base('error', 'job-aborted', 'LaTeX stopped before the end of the document', { hidden: true })
  }
  if (/^\*\*\* \(job aborted/.test(msg)) {
    // e.g. "file error in nonstop mode": always the consequence of another error.
    return base('error', 'job-aborted', 'LaTeX stopped before the end of the document', { hidden: true })
  }

  if (/^Emergency stop|==> Fatal error occurred/.test(msg)) {
    return base('error', 'stopped', 'LaTeX stopped', { hidden: true })
  }

  // --- anything else: TeX's message, with its help text as the explanation ----
  return base('error', 'tex-error', msg.replace(/\.$/, ''), { explanation: helpText(e) })
}

async function missingFile(
  name: string,
  e: LogEntry,
  file: string | null,
  ctx: DiagnoseContext,
  base: (s: Severity, rule: string, title: string, extra?: Partial<Problem>) => Problem,
): Promise<Problem> {
  if (/\.(sty|cls)$/.test(name)) {
    const kind = name.endsWith('.cls') ? 'class' : 'package'
    return base('error', 'missing-package', `The ${kind} ${name} isn't installed`, {
      explanation: `MiKTeX couldn't find or install ${name}. Check the spelling in \\${kind === 'class' ? 'documentclass' : 'usepackage'}; ${kind === 'class' ? 'if it is one of your templates, check that it is in the global template folder (File → Template Folder)' : 'if the name is right, install it with the MiKTeX Console'}.`,
    })
  }
  const wantExt = /\.[A-Za-z0-9]+$/.exec(name)?.[0] ?? ''
  const isImage = IMAGE_EXT.test(name)
  const candidates = (await ctx.files()).filter((f) => (isImage ? IMAGE_EXT.test(f) : f.endsWith(wantExt || '.tex')))
  const noExt = (p: string) => p.replace(/\.[A-Za-z0-9]+$/, '')
  // Rank by distance of the whole path, then of the base name.
  const scored = candidates
    .map((c) => ({ c, d: Math.min(distanceLower(noExt(c), noExt(name)), distanceLower(baseName(noExt(c)), baseName(noExt(name))) + 1) }))
    .filter((s) => s.d <= Math.max(2, Math.floor(noExt(name).length / 4)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
  // The argument as the source wrote it: maybe without the extension.
  const src = file && e.line ? (await ctx.read(file))?.split(/\r?\n/)[e.line - 1] ?? '' : ''
  const written = src.includes(`{${name}}`) ? name : src.includes(`{${noExt(name)}}`) ? noExt(name) : null
  const fixes: QuickFix[] = written
    ? scored.map(({ c }) => {
        const replacement = written === name ? c : noExt(c)
        return { label: `Use ${c}`, edits: [edit(file, e.line, `{${written}}`, `{${replacement}}`)] }
      })
    : []
  return base('error', 'missing-file', `${isImage ? 'Image' : 'File'} not found: ${name}`, {
    explanation: scored.length
      ? `There's no ${name} in this vault. Did you mean ${scored.map((s) => s.c).join(', ')}?`
      : `There's no ${name} in this vault, and no file with a similar name. Paths are relative to the vault root (${isImage ? 'e.g. Images/...' : 'e.g. Pieces/...'}).`,
    fixes,
  })
}

async function warning(
  e: LogEntry,
  ctx: DiagnoseContext,
  base: (s: Severity, rule: string, title: string, extra?: Partial<Problem>) => Problem,
): Promise<Problem> {
  const msg = e.message
  let m: RegExpExecArray | null
  if (e.source === 'font') return base('warning', 'font-substitution', msg, { hidden: true })
  if (/Rerun to get|has changed\. Rerun|Label\(s\) may have changed|There were undefined references|There were multiply-defined labels/.test(msg)) {
    return base('warning', 'rerun', msg, { hidden: true })
  }
  if ((m = /^File `(.+?)' not found on input line/.exec(msg))) {
    return base('warning', 'missing-file-warning', msg, { hidden: true }) // the matching error explains it
  }
  if ((m = /^Reference `(.+?)' on page \d+ undefined/.exec(msg))) {
    const label = m[1]
    const suggestions = closest(label, await ctx.labels())
    return base('warning', 'undefined-reference', `No \\label{${label}} exists`, {
      explanation: suggestions.length
        ? `\\ref{${label}} points to a label that doesn't exist. Did you mean ${suggestions.join(', ')}?`
        : `\\ref{${label}} points to a label that doesn't exist, so it prints as ??. Add \\label{${label}} where it should point.`,
      fixes: suggestions.map((s) => ({ label: `Change to ${s}`, edits: [edit(locate(e.file, ctx), e.line, `{${label}}`, `{${s}}`)] })),
    })
  }
  if ((m = /^Citation `(.+?)' on page \d+ undefined/.exec(msg))) {
    return base('warning', 'undefined-citation', `No bibliography entry "${m[1]}"`, {
      explanation: `\\cite{${m[1]}} has no matching entry in the bibliography, so it prints as [?].`,
    })
  }
  if ((m = /^Label `(.+?)' multiply defined/.exec(msg))) {
    return base('warning', 'duplicate-label', `\\label{${m[1]}} is used more than once`, {
      explanation: 'Each label must be unique; references to it will point at the last one.',
    })
  }
  if ((m = /^Unused global option\(s\): \[(.+?)\]/.exec(msg))) {
    const opts = m[1]
    const src = (await ctx.read(ctx.doc)) ?? ''
    const lines = src.split(/\r?\n/)
    const idx = lines.findIndex((l) => /^[^%]*\\documentclass/.test(l))
    const fixes: QuickFix[] = idx >= 0 && lines[idx].includes(`[${opts}]`)
      ? [{ label: `Remove [${opts}]`, edits: [{ file: ctx.doc, line: idx + 1, find: `[${opts}]`, replace: '' }] }]
      : []
    return base('warning', 'unused-option', `The class option "${opts}" does nothing`, {
      file: ctx.doc,
      line: idx >= 0 ? idx + 1 : null,
      explanation: `\\documentclass passes "${opts}" on, but neither the class nor any package uses it. It may be a misspelling or left over from an older version of the class.`,
      fixes,
    })
  }
  if ((m = /^\\headheight is too small \(([\d.]+)pt\): Make it at least ([\d.]+)pt/.exec(msg))) {
    const need = Math.ceil(Number(m[2]))
    const cls = /^[^%\n]*\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/m.exec((await ctx.read(ctx.doc)) ?? '')?.[1]
    return base('warning', 'headheight', 'The page header is taller than the space reserved for it', {
      explanation: `The header needs ${need}pt but only ${m[1]}pt is reserved, so it may overlap the text. Add \\setlength{\\headheight}{${need}pt} to ${cls ? `${cls}.cls` : 'the class that defines the header'}, so every document using it is fixed at once.`,
    })
  }
  if ((m = /^`(.+?)' float specifier changed to `(.+?)'/.exec(msg))) {
    return base('layout', 'float-moved', `A figure couldn't go exactly "here" (${m[1]})`, {
      explanation: `LaTeX couldn't place it at this spot, so it allowed it to float to the top of a page (${m[2]}).`,
    })
  }
  return base('warning', 'warning', msg.replace(/ on input line \d+\.?$/, ''), {})
}

function badbox(e: LogEntry, base: (s: Severity, rule: string, title: string, extra?: Partial<Problem>) => Problem): Problem {
  const over = /^Overfull \\hbox \(([\d.]+)pt too wide\)/.exec(e.message)
  const under = /^Underfull \\[hv]box \(badness (\d+)\)/.exec(e.message)
  const lines = /at lines (\d+)--(\d+)/.exec(e.message)
  const where = lines ? (lines[1] === lines[2] ? ` (line ${lines[1]})` : ` (lines ${lines[1]}–${lines[2]})`) : ''
  // The box contents, with TeX's font switches and kerns stripped: readable text.
  const snippet = e.raw.slice(1).join(' ')
    .replace(/\\[A-Z0-9]+\/\S+\s*(\(-?\d+\)\s*)?/g, '')
    .replace(/\$?\[\]\$?/g, '')
    .replace(/-/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (over) {
    const amount = Number(over[1])
    return base('layout', 'overfull', `A line sticks out ${amount.toFixed(1)}pt into the margin${where}`, {
      explanation: snippet ? `The line is: "${snippet.slice(0, 120)}". Rewording or allowing a hyphenation point usually fixes it.` : undefined,
      hidden: amount < 1,
    })
  }
  if (under) {
    return base('layout', 'underfull', `A line is stretched too loosely${where}`, {
      explanation: 'Usually from a \\\\ or \\newline at the end of a paragraph, or text that is hard to break. Often harmless.',
      hidden: Number(under[1]) < 10000 || !snippet,
    })
  }
  return base('layout', 'badbox', e.message, { hidden: true })
}

/** Errors that are probably consequences of an earlier one. */
function markFollowOns(problems: Problem[], state: State): void {
  const real = problems.filter((p) => p.severity === 'error' && !p.hidden)
  for (let k = 0; k < real.length; k++) {
    const p = real[k]
    const inBadEnv = state.badEnvs.some((b) => b.file === p.file && p.line != null && p.line >= b.from && p.line <= b.to && !(p.rule === 'undefined-environment' && p.line === b.from))
    const endsBadEnv = p.rule === 'env-mismatch' && state.badEnvs.some((b) => p.title.includes(`\\end{${b.name}}`))
    const repeatsEarlier = real.slice(0, k).some((q) =>
      q.file === p.file && q.line != null && p.line != null && Math.abs(q.line - p.line) <= 2 &&
      (q.rule === p.rule || (['missing-dollar', 'unclosed-math'].includes(q.rule) && p.rule === 'missing-dollar')))
    if (inBadEnv || endsBadEnv || repeatsEarlier) p.followOn = true
  }
  // "LaTeX stopped" notices only matter when nothing else explains the stop.
  if (!real.length) for (const p of problems) if (p.rule === 'stopped' || p.rule === 'job-aborted') p.hidden = false
}

// --- helpers ------------------------------------------------------------------

function locate(file: string | null, ctx: DiagnoseContext): string | null {
  if (!file) return ctx.doc
  const abs = isAbsolute(file) ? file : resolve(ctx.root, file)
  const rel = relative(ctx.root, abs)
  if (rel.startsWith('..') || isAbsolute(rel)) return abs
  return rel.split(sep).join('/')
}

function edit(file: string | null, line: number | null, find: string, replace: string, context?: { before: string }): TextEdit {
  // The error column is where TeX's "before" text ends on that line.
  const near = context ? context.before.replace(/^\.\.\./, '').length : undefined
  return { file: file ?? '', line: line ?? 1, find, replace, near }
}

async function findLine(ctx: DiagnoseContext, file: string | null, text: string, from: number): Promise<number | null> {
  const src = file ? await ctx.read(file) : null
  if (!src) return null
  const lines = src.split(/\r?\n/)
  for (let i = from - 1; i < lines.length; i++) if (lines[i].includes(text)) return i + 1
  return null
}

async function usePackageFix(ctx: DiagnoseContext, pkg: string): Promise<QuickFix | null> {
  if (!pkg) return null
  const src = await ctx.read(ctx.doc)
  if (!src) return null
  const lines = src.split(/\r?\n/)
  const idx = lines.findIndex((l) => /^[^%]*\\documentclass/.test(l))
  if (idx < 0) return null
  return {
    label: `Add \\usepackage{${pkg}}`,
    edits: [{ file: ctx.doc, line: idx + 1, find: lines[idx], replace: `${lines[idx]}\n\\usepackage{${pkg}}` }],
  }
}

function helpText(e: LogEntry): string | undefined {
  // TeX's help paragraph: the lines after the context, before the block ends.
  const i = e.raw.findIndex((l) => /^l\.\d+ /.test(l))
  const help = (i >= 0 ? e.raw.slice(i + 2) : e.raw.slice(1))
    .filter((l) => l.trim() && !/^(See the|Type +H|Type +X|Enter file name)/.test(l))
    .join(' ')
    .trim()
  return help || undefined
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const distanceLower = (a: string, b: string) => distance(a.toLowerCase(), b.toLowerCase())
/** Own-property lookup, so a command named e.g. \constructor can't hit Object.prototype. */
const lookup = (table: Record<string, string>, key: string) => (Object.hasOwn(table, key) ? table[key] : undefined)
