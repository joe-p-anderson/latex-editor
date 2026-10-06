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
