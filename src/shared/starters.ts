// Starter files for the New File dialog. A starter is any text file whose
// `{{Name}}` or `{{Name|default}}` placeholders become fields to fill in.
// {{date}}, {{filename}} and {{basename}} are filled in automatically, and
// `\{{` writes a literal `{{`. An optional first line, `%% starter: <text>`,
// describes the starter and is left out of the new file.

export interface Starter {
  id: string
  name: string
  ext: string
  description: string
  source: 'built-in' | 'vault' | 'global'
  text: string
  /** Files made beside the new one, by name, unless one of that name is already there (e.g. references.bib). */
  companions?: { name: string; text: string }[]
}

/** The app-wide default starter, until the user picks another. */
export const DEFAULT_STARTER = 'Lab report (revtex)'

/** A default starter's name as read from a settings file: trimmed, or null when it isn't there or is blank. */
export const starterName = (value: unknown): string | null => (typeof value === 'string' && value.trim()) || null

/**
 * The starter to preselect: the one named by the vault's default, else by the
 * app's, else the shipped default; a user's starter wins over a built-in one
 * of the same name. Names match ignoring case.
 */
export function defaultStarter(starters: Starter[], vaultDefault: string | null, appDefault: string): Starter | undefined {
  const named = (name: string | null) => (name ? starters.findLast((s) => s.name.toLowerCase() === name.toLowerCase()) : undefined)
  return named(vaultDefault) ?? named(appDefault) ?? named(DEFAULT_STARTER) ?? starters[0]
}

export interface StarterField {
  name: string
  default: string
}

const AUTOMATIC = new Set(['date', 'filename', 'basename'])
const FIELD = /(?<!\\)\{\{\s*([A-Za-z0-9][\w -]*?)\s*(?:\|([^{}]*))?\}\}/g

const HEADER = /^%% starter:[ \t]*(.*)\r?\n?/

/** The description line and the text without it. */
export function splitHeader(text: string): { description: string; body: string } {
  const m = HEADER.exec(text)
  return m ? { description: m[1].trim(), body: text.slice(m[0].length) } : { description: '', body: text }
}

/** The fields to ask for, once each, in order of first appearance (the first default given wins). */
export function fields(text: string): StarterField[] {
  const out = new Map<string, StarterField>()
  for (const m of splitHeader(text).body.matchAll(FIELD)) {
    const name = m[1]
    if (AUTOMATIC.has(name.toLowerCase())) continue
    const have = out.get(name)
    if (!have) out.set(name, { name, default: m[2] ?? '' })
    else if (!have.default && m[2]) have.default = m[2]
  }
  return [...out.values()]
}

export interface AutoValues {
  date: string
  filename: string
  basename: string
}

/** The starter's text with its fields filled from `values` (a missing one takes its default). */
export function fill(text: string, values: Record<string, string>, auto: AutoValues): string {
  const defaults = new Map(fields(text).map((f) => [f.name, f.default]))
  return splitHeader(text)
    .body.replace(FIELD, (_all, name: string) => {
      const key = name.toLowerCase()
      if (AUTOMATIC.has(key)) return auto[key as keyof AutoValues]
      return values[name] ?? defaults.get(name) ?? ''
    })
    .replace(/\\\{\{/g, '{{')
}
